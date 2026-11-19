import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { CLASS_EMOJIS, inviteCode, now, pick } from "../lib/util.js";
import { publicUser } from "./users.js";

const ROLE_RANK = { student: 0, teacher: 1, owner: 2 };
export const isStaff = (role) => role === "teacher" || role === "owner";

const DEFAULT_CHANNELS = [
  { name: "general", topic: "General chat for the whole class", kind: "text" },
  { name: "announcements", topic: "News and reminders from teachers", kind: "announcement" },
  { name: "homework", topic: "Ask and answer homework questions", kind: "text" },
  { name: "random", topic: "Anything not about school", kind: "text" },
];

const classSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(50),
  description: z.string().trim().max(200).optional(),
  emoji: z.string().min(1).max(16).optional(),
});
const joinSchema = z.object({ code: z.string().trim().min(4).max(12) });
const roleSchema = z.object({ role: z.enum(["student", "teacher", "owner"]) });
const muteSchema = z.object({ minutes: z.number().int().min(0).max(60 * 24 * 7) });

export function createClassService(db) {
  function uniqueCode() {
    for (;;) {
      const code = inviteCode();
      if (!db.get("SELECT 1 FROM classes WHERE student_code = ? OR teacher_code = ?", code, code)) return code;
    }
  }

  const service = {
    membership(classId, userId) {
      return db.get("SELECT * FROM memberships WHERE class_id = ? AND user_id = ?", classId, userId);
    },

    /** Throws unless the user belongs to the class; returns the membership. */
    requireMember(classId, userId) {
      const m = this.membership(classId, userId);
      if (!m) throw notFound("Class not found (or you're not in it).");
      return m;
    },

    requireStaff(classId, userId) {
      const m = this.requireMember(classId, userId);
      if (!isStaff(m.role)) throw forbidden("Only teachers can do that.");
      return m;
    },

    listForUser(userId) {
      return db
        .all(
          `SELECT c.id, c.name, c.emoji, c.description, m.role
             FROM memberships m JOIN classes c ON c.id = m.class_id
            WHERE m.user_id = ? ORDER BY m.joined_at`,
          userId,
        )
        .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, description: c.description, role: c.role }));
    },

    create(userId, input) {
      const data = parse(classSchema, input);
      return db.tx(() => {
        const t = now();
        const { lastInsertRowid } = db.run(
          `INSERT INTO classes (name, description, emoji, student_code, teacher_code, owner_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          data.name,
          data.description ?? "",
          data.emoji ?? pick(CLASS_EMOJIS),
          uniqueCode(),
          uniqueCode(),
          userId,
          t,
        );
        const classId = Number(lastInsertRowid);
        db.run("INSERT INTO memberships (class_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)", classId, userId, t);
        DEFAULT_CHANNELS.forEach((ch, i) => {
          db.run(
            "INSERT INTO channels (class_id, name, topic, kind, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            classId, ch.name, ch.topic, ch.kind, i, userId, t,
          );
        });
        return classId;
      });
    },

    /** Joins with a student or teacher code. Returns { classId, role, alreadyMember }. */
    join(userId, input) {
      const { code } = parse(joinSchema, input);
      const upper = code.toUpperCase();
      const cls = db.get("SELECT * FROM classes WHERE student_code = ? OR teacher_code = ?", upper, upper);
      if (!cls) throw notFound("No class has that code. Check it with your teacher.");
      const role = cls.teacher_code === upper ? "teacher" : "student";
      const existing = this.membership(cls.id, userId);
      if (existing) {
        // A student who later receives the teacher code gets promoted.
        if (ROLE_RANK[role] > ROLE_RANK[existing.role]) {
          db.run("UPDATE memberships SET role = ? WHERE class_id = ? AND user_id = ?", role, cls.id, userId);
          return { classId: cls.id, role, alreadyMember: true, promoted: true };
        }
        return { classId: cls.id, role: existing.role, alreadyMember: true };
      }
      db.tx(() => {
        db.run("INSERT INTO memberships (class_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)", cls.id, userId, role, now());
        // Newcomers start "caught up" instead of with hundreds of unread messages.
        db.run(
          `INSERT OR REPLACE INTO read_state (channel_id, user_id, last_read_id)
           SELECT c.id, ?, COALESCE((SELECT MAX(id) FROM messages WHERE channel_id = c.id), 0)
             FROM channels c WHERE c.class_id = ? AND c.kind <> 'dm'`,
          userId, cls.id,
        );
      });
      return { classId: cls.id, role, alreadyMember: false };
    },

    getClass(classId) {
      return db.get("SELECT * FROM classes WHERE id = ?", classId);
    },

    classDto(cls, role) {
      const dto = {
        id: cls.id,
        name: cls.name,
        description: cls.description,
        emoji: cls.emoji,
        ownerId: cls.owner_id,
      };
      if (isStaff(role)) {
        dto.studentCode = cls.student_code;
        dto.teacherCode = cls.teacher_code;
      }
      return dto;
    },

    members(classId) {
      return db
        .all(
          `SELECT u.*, m.role, m.muted_until, m.joined_at FROM memberships m JOIN users u ON u.id = m.user_id
            WHERE m.class_id = ? ORDER BY u.display_name COLLATE NOCASE`,
          classId,
        )
        .map((row) => memberDto(row));
    },

    member(classId, userId) {
      const row = db.get(
        `SELECT u.*, m.role, m.muted_until, m.joined_at FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.class_id = ? AND m.user_id = ?`,
        classId, userId,
      );
      return row ? memberDto(row) : null;
    },

    update(classId, userId, input) {
      this.requireStaff(classId, userId);
      const data = parse(classSchema.partial(), input);
      const cls = this.getClass(classId);
      db.run(
        "UPDATE classes SET name = ?, description = ?, emoji = ? WHERE id = ?",
        data.name ?? cls.name,
        data.description ?? cls.description,
        data.emoji ?? cls.emoji,
        classId,
      );
      return this.getClass(classId);
    },

    regenerateCodes(classId, userId) {
      const m = this.requireMember(classId, userId);
      if (m.role !== "owner") throw forbidden("Only the class owner can reset invite codes.");
      db.run("UPDATE classes SET student_code = ?, teacher_code = ? WHERE id = ?", uniqueCode(), uniqueCode(), classId);
      return this.getClass(classId);
    },

    leave(classId, userId) {
      const m = this.requireMember(classId, userId);
      if (m.role === "owner") {
        throw badRequest("You own this class. Hand ownership to a teacher first, or delete the class.");
      }
      db.run("DELETE FROM memberships WHERE class_id = ? AND user_id = ?", classId, userId);
    },

    remove(classId, userId) {
      const m = this.requireMember(classId, userId);
      if (m.role !== "owner") throw forbidden("Only the class owner can delete the class.");
      db.run("DELETE FROM classes WHERE id = ?", classId);
    },

    /** Owner-only. Making someone "owner" transfers ownership (old owner becomes teacher). */
    setRole(classId, actorId, targetId, input) {
      const { role } = parse(roleSchema, input);
      const actor = this.requireMember(classId, actorId);
      if (actor.role !== "owner") throw forbidden("Only the class owner can change roles.");
      if (actorId === targetId) throw badRequest("You can't change your own role.");
      this.requireMember(classId, targetId);
      db.tx(() => {
        if (role === "owner") {
          db.run("UPDATE memberships SET role = 'teacher' WHERE class_id = ? AND user_id = ?", classId, actorId);
          db.run("UPDATE classes SET owner_id = ? WHERE id = ?", targetId, classId);
        }
        db.run("UPDATE memberships SET role = ?, muted_until = NULL WHERE class_id = ? AND user_id = ?", role, classId, targetId);
      });
    },

    /** Staff can moderate people ranked below them. */
    requireOutranks(classId, actorId, targetId) {
      const actor = this.requireStaff(classId, actorId);
      if (actorId === targetId) throw badRequest("You can't do that to yourself.");
      const target = this.requireMember(classId, targetId);
      if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) throw forbidden("You can only moderate people below your role.");
      return target;
    },

    mute(classId, actorId, targetId, input) {
      const { minutes } = parse(muteSchema, input);
      this.requireOutranks(classId, actorId, targetId);
      const until = minutes === 0 ? null : now() + minutes * 60_000;
      db.run("UPDATE memberships SET muted_until = ? WHERE class_id = ? AND user_id = ?", until, classId, targetId);
      return until;
    },

    kick(classId, actorId, targetId) {
      this.requireOutranks(classId, actorId, targetId);
      db.run("DELETE FROM memberships WHERE class_id = ? AND user_id = ?", classId, targetId);
    },

    /** IDs of every class member — used to fan out realtime events. */
    memberIds(classId) {
      return db.all("SELECT user_id FROM memberships WHERE class_id = ?", classId).map((r) => r.user_id);
    },
  };
  return service;
}

function memberDto(row) {
  return {
    ...publicUser(row),
    role: row.role,
    mutedUntil: row.muted_until && row.muted_until > Date.now() ? row.muted_until : null,
    joinedAt: row.joined_at,
  };
}
