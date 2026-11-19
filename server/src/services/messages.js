import { localDate } from "../lib/countdown.js";
import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { now } from "../lib/util.js";
import { BOT } from "../bot/persona.js";
import { isStaff } from "./classes.js";
import { publicUser } from "./users.js";

export const MAX_BODY = 4000;
const PAGE_MAX = 100;

const pollSchema = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2, "needs at least 2 options").max(10),
  multiple: z.boolean().optional(),
  anonymous: z.boolean().optional(),
});
const createSchema = z.object({
  body: z.string().max(MAX_BODY, `messages are limited to ${MAX_BODY} characters`).default(""),
  replyToId: z.number().int().positive().nullish(),
  attachmentIds: z.array(z.string().min(1).max(64)).max(10).default([]),
  poll: pollSchema.nullish(),
  clientId: z.string().max(64).optional(),
});
const editSchema = z.object({ body: z.string().trim().min(1).max(MAX_BODY) });
// A unicode emoji, or a class emoji written as ":name:".
const reactSchema = z.object({ emoji: z.string().min(1).max(32) });
const voteSchema = z.object({ optionIds: z.array(z.number().int().positive()).max(10) });

const ids = (list) => JSON.stringify(list);

export function createMessageService(db, { channels, classes }) {
  const MESSAGE_COLUMNS = `m.*, u.username, u.display_name, u.avatar_emoji, u.avatar_color, u.status_text`;

  /** Loads attachments, reactions, polls and reply previews for many messages at once (no N+1). */
  function hydrate(rows, viewerId) {
    if (rows.length === 0) return [];
    const messageIds = ids(rows.map((r) => r.id));

    const attachments = new Map();
    for (const a of db.all(
      `SELECT * FROM attachments WHERE message_id IN (SELECT value FROM json_each(?)) ORDER BY id`,
      messageIds,
    )) {
      if (!attachments.has(a.message_id)) attachments.set(a.message_id, []);
      attachments.get(a.message_id).push(attachmentDto(a));
    }

    const reactions = new Map();
    for (const r of db.all(
      `SELECT message_id, emoji, user_id FROM reactions
        WHERE message_id IN (SELECT value FROM json_each(?)) ORDER BY created_at`,
      messageIds,
    )) {
      if (!reactions.has(r.message_id)) reactions.set(r.message_id, new Map());
      const byEmoji = reactions.get(r.message_id);
      if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
      byEmoji.get(r.emoji).push(r.user_id);
    }

    const polls = new Map();
    const pollRows = db.all(`SELECT * FROM polls WHERE message_id IN (SELECT value FROM json_each(?))`, messageIds);
    if (pollRows.length) {
      const pollIds = ids(pollRows.map((p) => p.message_id));
      const options = db.all(
        `SELECT o.*, (SELECT json_group_array(user_id) FROM poll_votes v WHERE v.option_id = o.id) AS voters
           FROM poll_options o WHERE o.message_id IN (SELECT value FROM json_each(?)) ORDER BY o.position`,
        pollIds,
      );
      for (const p of pollRows) {
        const opts = options.filter((o) => o.message_id === p.message_id).map((o) => ({ ...o, voters: JSON.parse(o.voters) }));
        polls.set(p.message_id, pollDto(p, opts, viewerId));
      }
    }

    const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];
    const replies = new Map();
    if (replyIds.length) {
      for (const r of db.all(
        `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.id IN (SELECT value FROM json_each(?))`,
        ids(replyIds),
      )) {
        replies.set(r.id, {
          id: r.id,
          deleted: !!r.deleted_at,
          body: r.deleted_at ? "" : r.body.slice(0, 160),
          author: authorOf(r),
          hasAttachments: !!db.get("SELECT 1 FROM attachments WHERE message_id = ?", r.id),
        });
      }
    }

    const chessIds = rows.filter((r) => r.meta && !r.deleted_at && r.meta.includes('"chess"')).map((r) => r.id);
    const games = chessIds.length && extensions.chess ? extensions.chess.forMessages(chessIds) : new Map();
    const imposterIds = rows.filter((r) => r.meta && !r.deleted_at && r.meta.includes('"imposter"')).map((r) => r.id);
    const imposterGames = imposterIds.length && extensions.imposter ? extensions.imposter.forMessages(imposterIds) : new Map();

    return rows.map((r) => {
      const deleted = !!r.deleted_at;
      const meta = !deleted && r.meta ? JSON.parse(r.meta) : null;
      return {
        meta,
        chess: games.get(r.id) ?? null,
        imposter: imposterGames.get(r.id) ?? null,
        id: r.id,
        channelId: r.channel_id,
        kind: r.kind,
        author: authorOf(r),
        body: deleted ? "" : r.body,
        createdAt: r.created_at,
        editedAt: r.edited_at,
        deleted,
        deletedByStaff: deleted && r.deleted_by !== r.user_id,
        pinned: !!r.pinned_at && !deleted,
        replyTo: r.reply_to_id ? replies.get(r.reply_to_id) ?? { id: r.reply_to_id, deleted: true, body: "" } : null,
        attachments: deleted ? [] : attachments.get(r.id) ?? [],
        reactions: deleted
          ? []
          : [...(reactions.get(r.id) ?? new Map())].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds })),
        poll: deleted ? null : polls.get(r.id) ?? null,
      };
    });
  }

  function rowById(id) {
    return db.get(`SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`, id);
  }

  const extensions = {};

  const service = {
    hydrate,

    get(id, viewerId) {
      const row = rowById(id);
      return row ? hydrate([row], viewerId)[0] : null;
    },

    /** Cursor pagination: `before`/`after` an id, or a window `around` an id. */
    list(channelId, userId, { before, after, around, limit = 50 } = {}) {
      channels.access(channelId, userId);
      const n = Math.min(Math.max(Number(limit) || 50, 1), PAGE_MAX);
      const base = `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.channel_id = ?`;
      let rows;
      let hasMore = false;
      let hasNewer = false;
      if (around) {
        const half = Math.floor(n / 2);
        const older = db.all(`${base} AND m.id <= ? ORDER BY m.id DESC LIMIT ?`, channelId, around, half + 1);
        const newer = db.all(`${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`, channelId, around, half + 1);
        hasMore = older.length > half;
        hasNewer = newer.length > half;
        rows = [...older.slice(0, half).reverse(), ...newer.slice(0, half)];
      } else if (after) {
        rows = db.all(`${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`, channelId, after, n + 1);
        hasNewer = rows.length > n;
        rows = rows.slice(0, n);
      } else {
        rows = before
          ? db.all(`${base} AND m.id < ? ORDER BY m.id DESC LIMIT ?`, channelId, before, n + 1)
          : db.all(`${base} ORDER BY m.id DESC LIMIT ?`, channelId, n + 1);
        hasMore = rows.length > n;
        rows = rows.slice(0, n).reverse();
      }
      return { messages: hydrate(rows, userId), hasMore, hasNewer };
    },

    /** Validates & stores a user message (with attachments / poll). Returns the stored row id. */
    create(channelId, userId, input, { skipPermission = false } = {}) {
      const data = parse(createSchema, input);
      const { channel, membership } = channels.access(channelId, userId);
      if (!skipPermission) channels.assertCanPost(channel, membership);
      const body = data.body.trim();
      if (!body && data.attachmentIds.length === 0 && !data.poll) throw badRequest("Can't send an empty message.");

      if (data.replyToId) {
        const target = db.get("SELECT channel_id FROM messages WHERE id = ?", data.replyToId);
        if (!target || target.channel_id !== channelId) throw badRequest("You can only reply to messages in the same channel.");
      }

      return db.tx(() => {
        const t = now();
        const { lastInsertRowid } = db.run(
          "INSERT INTO messages (channel_id, user_id, kind, body, reply_to_id, created_at) VALUES (?, ?, 'user', ?, ?, ?)",
          channelId, userId, body, data.replyToId ?? null, t,
        );
        const messageId = Number(lastInsertRowid);

        for (const publicId of data.attachmentIds) {
          const res = db.run(
            `UPDATE attachments SET message_id = ?
              WHERE public_id = ? AND uploader_id = ? AND class_id = ? AND message_id IS NULL`,
            messageId, publicId, userId, channel.class_id,
          );
          if (res.changes !== 1) throw badRequest("One of the attachments is missing. Try uploading it again.");
        }

        if (data.poll) {
          db.run(
            "INSERT INTO polls (message_id, question, multiple, anonymous) VALUES (?, ?, ?, ?)",
            messageId, data.poll.question, data.poll.multiple ? 1 : 0, data.poll.anonymous ? 1 : 0,
          );
          data.poll.options.forEach((text, i) =>
            db.run("INSERT INTO poll_options (message_id, text, position) VALUES (?, ?, ?)", messageId, text, i),
          );
        }

        // Sending a message means you've read the channel up to it.
        db.run(
          `INSERT INTO read_state (channel_id, user_id, last_read_id) VALUES (?, ?, ?)
           ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
          channelId, userId, messageId,
        );
        return messageId;
      });
    },

    /** Messages from Thinkmas or the system (no permission checks — called by trusted code). */
    createBotMessage(channelId, body, { replyToId = null, kind = "bot", meta = null } = {}) {
      const { lastInsertRowid } = db.run(
        "INSERT INTO messages (channel_id, user_id, kind, body, reply_to_id, meta, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)",
        channelId, kind, body.slice(0, MAX_BODY), replyToId, meta ? JSON.stringify(meta) : null, now(),
      );
      return Number(lastInsertRowid);
    },

    /** A message from a user with a special payload (e.g. a chess challenge). Trusted callers only. */
    createWithMeta(channelId, userId, body, meta) {
      const { lastInsertRowid } = db.run(
        "INSERT INTO messages (channel_id, user_id, kind, body, meta, created_at) VALUES (?, ?, 'user', ?, ?, ?)",
        channelId, userId, body.slice(0, MAX_BODY), JSON.stringify(meta), now(),
      );
      const id = Number(lastInsertRowid);
      db.run(
        `INSERT INTO read_state (channel_id, user_id, last_read_id) VALUES (?, ?, ?)
         ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
        channelId, userId, id,
      );
      return id;
    },

    /** Lets feature services (chess) decorate hydrated messages without a circular import. */
    extend(name, ext) {
      extensions[name] = ext;
    },

    /** Loads a message plus its channel/membership after an access check. */
    context(messageId, userId) {
      const msg = db.get("SELECT * FROM messages WHERE id = ?", messageId);
      if (!msg) throw notFound("Message not found.");
      const { channel, membership } = channels.access(msg.channel_id, userId);
      return { msg, channel, membership };
    },

    edit(messageId, userId, input) {
      const { body } = parse(editSchema, input);
      const { msg, channel } = this.context(messageId, userId);
      if (msg.user_id !== userId) throw forbidden("You can only edit your own messages.");
      if (msg.deleted_at) throw badRequest("That message was deleted.");
      db.run("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?", body, now(), messageId);
      return { channel };
    },

    remove(messageId, userId) {
      const { msg, channel, membership } = this.context(messageId, userId);
      const own = msg.user_id === userId;
      if (!own && !isStaff(membership.role)) throw forbidden("You can only delete your own messages.");
      if (msg.deleted_at) return { channel };
      db.tx(() => {
        // Body is wiped (not just hidden) so deleted text also leaves the search index.
        db.run(
          "UPDATE messages SET body = '', deleted_at = ?, deleted_by = ?, pinned_at = NULL WHERE id = ?",
          now(), userId, messageId,
        );
        db.run("DELETE FROM reactions WHERE message_id = ?", messageId);
      });
      return { channel, attachments: db.all("SELECT stored_name FROM attachments WHERE message_id = ?", messageId) };
    },

    toggleReaction(messageId, userId, input) {
      const { emoji } = parse(reactSchema, input);
      const { msg, channel } = this.context(messageId, userId);
      if (msg.deleted_at) throw badRequest("Can't react to a deleted message.");
      const exists = db.get("SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, userId, emoji);
      if (exists) {
        db.run("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", messageId, userId, emoji);
      } else {
        const distinct = db.get("SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?", messageId).n;
        if (distinct >= 20) throw badRequest("This message already has the maximum number of reactions.");
        db.run("INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageId, userId, emoji, now());
      }
      return { channel, reactions: this.get(messageId, userId).reactions };
    },

    setPinned(messageId, userId, pinned) {
      const { msg, channel, membership } = this.context(messageId, userId);
      if (channel.kind !== "dm" && !isStaff(membership.role)) throw forbidden("Only teachers can pin messages.");
      if (msg.deleted_at) throw badRequest("Can't pin a deleted message.");
      db.run("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?", pinned ? now() : null, pinned ? userId : null, messageId);
      return { channel };
    },

    /** Unpins countdowns whose day is over. Returns [{ id, channel }] so the caller can tell the clients. */
    unpinFinishedCountdowns(today = localDate()) {
      const rows = db.all(
        `SELECT id, channel_id, meta FROM messages WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND meta LIKE '%"countdown"%'`,
      );
      const done = rows.filter((r) => {
        try {
          const meta = JSON.parse(r.meta);
          return meta.type === "countdown" && meta.date < today;
        } catch {
          return false;
        }
      });
      for (const r of done) db.run("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?", r.id);
      return done.map((r) => ({ id: r.id, channel: channels.byId(r.channel_id) })).filter((x) => x.channel);
    },

    pins(channelId, userId) {
      channels.access(channelId, userId);
      const rows = db.all(
        `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.user_id
          WHERE m.channel_id = ? AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC LIMIT 50`,
        channelId,
      );
      return hydrate(rows, userId);
    },

    vote(messageId, userId, input) {
      const { optionIds } = parse(voteSchema, input);
      const { channel } = this.context(messageId, userId);
      const poll = db.get("SELECT * FROM polls WHERE message_id = ?", messageId);
      if (!poll) throw notFound("Poll not found.");
      if (poll.closed_at) throw badRequest("This poll is closed.");
      if (!poll.multiple && optionIds.length > 1) throw badRequest("You can only pick one option.");
      const valid = new Set(db.all("SELECT id FROM poll_options WHERE message_id = ?", messageId).map((o) => o.id));
      if (optionIds.some((id) => !valid.has(id))) throw badRequest("Unknown poll option.");
      db.tx(() => {
        db.run(
          "DELETE FROM poll_votes WHERE user_id = ? AND option_id IN (SELECT id FROM poll_options WHERE message_id = ?)",
          userId, messageId,
        );
        for (const id of optionIds) db.run("INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)", id, userId);
      });
      return { channel };
    },

    closePoll(messageId, userId) {
      const { msg, channel, membership } = this.context(messageId, userId);
      if (msg.user_id !== userId && !isStaff(membership.role)) throw forbidden("Only the poll's author or a teacher can close it.");
      db.run("UPDATE polls SET closed_at = ? WHERE message_id = ? AND closed_at IS NULL", now(), messageId);
      return { channel };
    },

    /** Full-text search across every channel of the class the user can see. */
    search(classId, userId, query, { channelId } = {}) {
      classes.requireMember(classId, userId);
      const terms = String(query ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .map((t) => `"${t.replace(/"/g, '""')}"*`);
      if (terms.length === 0) return [];
      const rows = db.all(
        `SELECT ${MESSAGE_COLUMNS} FROM messages_fts f
           JOIN messages m ON m.id = f.rowid
           JOIN channels c ON c.id = m.channel_id
           LEFT JOIN users u ON u.id = m.user_id
          WHERE messages_fts MATCH ? AND c.class_id = ? AND m.deleted_at IS NULL
            AND (? IS NULL OR c.id = ?)
            AND (c.kind <> 'dm' OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?))
          ORDER BY m.id DESC LIMIT 40`,
        terms.join(" "), classId, channelId ?? null, channelId ?? null, userId,
      );
      return hydrate(rows, userId);
    },
  };
  return service;
}

function authorOf(row) {
  if (row.kind === "bot" || (!row.user_id && row.kind !== "system")) return { ...BOT };
  if (!row.user_id) return null;
  return publicUser({ ...row, id: row.user_id });
}

export function attachmentDto(a) {
  return {
    id: a.public_id,
    name: a.original_name,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    duration: a.duration,
    url: `/api/files/${a.public_id}/${encodeURIComponent(a.original_name)}`,
  };
}

function pollDto(p, options, viewerId) {
  const voters = new Set(options.flatMap((o) => o.voters));
  return {
    question: p.question,
    multiple: !!p.multiple,
    anonymous: !!p.anonymous,
    closed: !!p.closed_at,
    totalVoters: voters.size,
    myVotes: options.filter((o) => o.voters.includes(viewerId)).map((o) => o.id),
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o.voters.length,
      ...(p.anonymous ? {} : { voterIds: o.voters }),
    })),
  };
}
