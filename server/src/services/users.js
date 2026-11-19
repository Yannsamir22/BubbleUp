import bcrypt from "bcryptjs";
import { z } from "zod";
import { badRequest, conflict, parse, unauthorized } from "../lib/errors.js";
import { AVATAR_COLORS, now, pick } from "../lib/util.js";
import { BOT } from "../bot/persona.js";

const BCRYPT_ROUNDS = 10;
// Compared against when the user does not exist, so timing does not leak which usernames exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);
const RESERVED = new Set([BOT.username, "admin", "system", "everyone", "here", "bubbleup"]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "must be at least 3 characters")
  .max(20, "must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "only letters, numbers, dots, dashes and underscores");
const passwordSchema = z.string().min(6, "must be at least 6 characters").max(200);
const displayNameSchema = z.string().trim().min(1, "can't be empty").max(40);

const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});
const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
const profileSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarEmoji: z.string().max(16).optional(), // "" = show initials
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour").optional(),
  statusText: z.string().trim().max(80).optional(),
});
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

/** The shape of a user that is safe to send to any other user. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarEmoji: u.avatar_emoji,
    avatarColor: u.avatar_color,
    statusText: u.status_text,
  };
}

export function createUserService(db) {
  return {
    async register(input) {
      const data = parse(registerSchema, input);
      if (RESERVED.has(data.username.toLowerCase())) throw conflict("That username is reserved. Please choose another.");
      if (db.get("SELECT 1 FROM users WHERE username = ?", data.username)) {
        throw conflict("That username is already taken.");
      }
      const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      const { lastInsertRowid } = db.run(
        `INSERT INTO users (username, display_name, password_hash, avatar_emoji, avatar_color, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        data.username,
        data.displayName || data.username,
        hash,
        "", // initials by default; people can pick an emoji in their profile
        pick(AVATAR_COLORS),
        now(),
      );
      return this.byId(Number(lastInsertRowid));
    },

    async login(input) {
      const data = parse(loginSchema, input);
      const user = db.get("SELECT * FROM users WHERE username = ?", data.username);
      // Always run bcrypt so response time doesn't reveal whether the user exists.
      const ok = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !ok) throw unauthorized("Wrong username or password.");
      return user;
    },

    byId(id) {
      return db.get("SELECT * FROM users WHERE id = ?", id);
    },

    updateProfile(userId, input) {
      const data = parse(profileSchema, input);
      const map = { displayName: "display_name", avatarEmoji: "avatar_emoji", avatarColor: "avatar_color", statusText: "status_text" };
      const sets = Object.keys(data).filter((k) => data[k] !== undefined);
      if (sets.length === 0) throw badRequest("Nothing to update.");
      db.run(
        `UPDATE users SET ${sets.map((k) => `${map[k]} = ?`).join(", ")} WHERE id = ?`,
        ...sets.map((k) => data[k]),
        userId,
      );
      return this.byId(userId);
    },

    /** Changing the password logs out every other session (token_version bump). */
    async changePassword(userId, input) {
      const data = parse(passwordChangeSchema, input);
      const user = this.byId(userId);
      if (!(await bcrypt.compare(data.currentPassword, user.password_hash))) {
        throw badRequest("Your current password is incorrect.");
      }
      const hash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
      db.run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", hash, userId);
      return this.byId(userId);
    },
  };
}
