import { z } from "zod";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors.js";
import { now, slugifyChannel } from "../lib/util.js";
import { isStaff } from "./classes.js";
import { publicUser } from "./users.js";

const channelSchema = z.object({
  name: z.string().trim().min(1).max(32),
  topic: z.string().trim().max(120).optional(),
  kind: z.enum(["text", "announcement"]).optional(),
});

export function createChannelService(db, classes) {
  return {
    byId(id) {
      return db.get("SELECT * FROM channels WHERE id = ?", id);
    },

    general(classId) {
      return db.get("SELECT * FROM channels WHERE class_id = ? AND name = 'general' AND kind <> 'dm'", classId);
    },

    /**
     * Central access check: the user must be in the channel's class and,
     * for DMs, one of the two participants. Returns { channel, membership }.
     */
    access(channelId, userId) {
      const channel = this.byId(channelId);
      if (!channel) throw notFound("Channel not found.");
      const membership = classes.membership(channel.class_id, userId);
      if (!membership) throw notFound("Channel not found.");
      if (channel.kind === "dm" && !db.get("SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?", channelId, userId)) {
        throw notFound("Channel not found.");
      }
      return { channel, membership };
    },

    /** Checks posting rights (announcement channels + mutes). */
    assertCanPost(channel, membership) {
      if (channel.kind === "announcement" && !isStaff(membership.role)) {
        throw forbidden("Only teachers can post in announcement channels. You can still react to posts.");
      }
      if (membership.muted_until && membership.muted_until > now() && !isStaff(membership.role)) {
        const mins = Math.ceil((membership.muted_until - now()) / 60_000);
        throw forbidden(`A teacher muted you. You can write again in ${mins} minute${mins === 1 ? "" : "s"}.`);
      }
    },

    /** All channels (including the user's DMs) of a class with unread info. */
    listForUser(classId, userId) {
      const me = db.get("SELECT username FROM users WHERE id = ?", userId);
      const rows = db.all(
        `SELECT c.*, COALESCE(rs.last_read_id, 0) AS last_read_id,
                (SELECT MAX(id) FROM messages WHERE channel_id = c.id) AS last_message_id,
                (SELECT MAX(created_at) FROM messages WHERE channel_id = c.id) AS last_message_at,
                (SELECT COUNT(*) FROM messages m
                   WHERE m.channel_id = c.id AND m.id > COALESCE(rs.last_read_id, 0)
                     AND m.deleted_at IS NULL AND m.kind <> 'system' AND (m.user_id IS NULL OR m.user_id <> ?)) AS unread,
                (SELECT COUNT(*) FROM messages m
                   WHERE m.channel_id = c.id AND m.id > COALESCE(rs.last_read_id, 0)
                     AND m.deleted_at IS NULL AND m.user_id <> ?
                     AND (instr(lower(m.body), '@' || lower(?)) > 0 OR instr(m.body, '@everyone') > 0)) AS mentions
           FROM channels c
           LEFT JOIN read_state rs ON rs.channel_id = c.id AND rs.user_id = ?
          WHERE c.class_id = ?
            AND (c.kind <> 'dm' OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?))
          ORDER BY c.position, c.id`,
        userId, userId, me.username, userId, classId, userId,
      );
      const dmPartners = this.dmPartners(classId, userId);
      return rows.map((c) => this.dto(c, dmPartners.get(c.id)));
    },

    dmPartners(classId, userId) {
      const rows = db.all(
        `SELECT cm.channel_id, u.* FROM channels c
           JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id <> ?
           JOIN users u ON u.id = cm.user_id
          WHERE c.class_id = ? AND c.kind = 'dm'
            AND EXISTS (SELECT 1 FROM channel_members me WHERE me.channel_id = c.id AND me.user_id = ?)`,
        userId, classId, userId,
      );
      return new Map(rows.map((r) => [r.channel_id, publicUser(r)]));
    },

    dto(c, dmUser) {
      const dto = {
        id: c.id,
        classId: c.class_id,
        name: c.name,
        topic: c.topic,
        kind: c.kind,
        position: c.position,
      };
      if (c.last_read_id !== undefined) {
        dto.lastReadId = c.last_read_id;
        dto.lastMessageId = c.last_message_id ?? 0;
        dto.lastMessageAt = c.last_message_at ?? c.created_at;
        dto.unread = c.unread;
        dto.mentions = c.mentions;
      }
      if (dmUser) dto.dmUser = dmUser;
      return dto;
    },

    create(classId, userId, input) {
      classes.requireStaff(classId, userId);
      const data = parse(channelSchema, input);
      const name = slugifyChannel(data.name);
      if (!name) throw badRequest("Channel names need at least one letter or number.");
      if (db.get("SELECT 1 FROM channels WHERE class_id = ? AND name = ? AND kind <> 'dm'", classId, name)) {
        throw conflict(`#${name} already exists.`);
      }
      const pos = db.get("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM channels WHERE class_id = ?", classId).p;
      const t = now();
      const { lastInsertRowid } = db.run(
        "INSERT INTO channels (class_id, name, topic, kind, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        classId, name, data.topic ?? "", data.kind ?? "text", pos, userId, t,
      );
      return this.byId(Number(lastInsertRowid));
    },

    update(channelId, userId, input) {
      const { channel } = this.access(channelId, userId);
      if (channel.kind === "dm") throw badRequest("DMs can't be renamed.");
      classes.requireStaff(channel.class_id, userId);
      const data = parse(channelSchema.partial(), input);
      let name = channel.name;
      if (data.name !== undefined) {
        name = slugifyChannel(data.name);
        if (!name) throw badRequest("Channel names need at least one letter or number.");
        if (name !== channel.name && db.get("SELECT 1 FROM channels WHERE class_id = ? AND name = ? AND kind <> 'dm'", channel.class_id, name)) {
          throw conflict(`#${name} already exists.`);
        }
        if (channel.name === "general" && name !== "general") throw badRequest("#general is special and can't be renamed.");
      }
      db.run(
        "UPDATE channels SET name = ?, topic = ?, kind = ? WHERE id = ?",
        name, data.topic ?? channel.topic, data.kind ?? channel.kind, channelId,
      );
      return this.byId(channelId);
    },

    remove(channelId, userId) {
      const { channel } = this.access(channelId, userId);
      if (channel.kind === "dm") throw badRequest("DMs can't be deleted.");
      classes.requireStaff(channel.class_id, userId);
      if (channel.name === "general") throw badRequest("#general can't be deleted.");
      db.run("DELETE FROM channels WHERE id = ?", channelId);
      return channel;
    },

    /** Finds or creates the DM channel between two members of the same class. */
    openDm(classId, userId, otherId) {
      classes.requireMember(classId, userId);
      if (userId === otherId) throw badRequest("You can't send a private message to yourself.");
      if (!classes.membership(classId, otherId)) throw notFound("That person isn't in this class.");
      const key = [userId, otherId].sort((a, b) => a - b).join(":");
      const existing = db.get("SELECT * FROM channels WHERE class_id = ? AND kind = 'dm' AND dm_key = ?", classId, key);
      if (existing) return { channel: existing, created: false };
      const channel = db.tx(() => {
        const { lastInsertRowid } = db.run(
          "INSERT INTO channels (class_id, name, kind, dm_key, created_by, created_at) VALUES (?, ?, 'dm', ?, ?, ?)",
          classId, `dm-${key}`, key, userId, now(),
        );
        const id = Number(lastInsertRowid);
        db.run("INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?), (?, ?)", id, userId, id, otherId);
        return this.byId(id);
      });
      return { channel, created: true };
    },

    dmMemberIds(channelId) {
      return db.all("SELECT user_id FROM channel_members WHERE channel_id = ?", channelId).map((r) => r.user_id);
    },

    /** Moves the read marker forward (never backwards). */
    markRead(channelId, userId, messageId) {
      this.access(channelId, userId);
      const max = db.get("SELECT MAX(id) AS id FROM messages WHERE channel_id = ?", channelId).id ?? 0;
      const target = Math.min(messageId ?? max, max);
      db.run(
        `INSERT INTO read_state (channel_id, user_id, last_read_id) VALUES (?, ?, ?)
         ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
        channelId, userId, target,
      );
      return db.get("SELECT last_read_id FROM read_state WHERE channel_id = ? AND user_id = ?", channelId, userId).last_read_id;
    },

    readStates(channelId) {
      return db
        .all("SELECT user_id, last_read_id FROM read_state WHERE channel_id = ?", channelId)
        .map((r) => ({ userId: r.user_id, lastReadId: r.last_read_id }));
    },
  };
}
