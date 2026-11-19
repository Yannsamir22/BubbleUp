import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { now, randomId } from "../lib/util.js";
import { isStaff } from "./classes.js";

const NAME = /^[a-z0-9_]{2,24}$/;
const TYPES = { "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/jpeg": ".jpg" };
const MAX_BYTES = 256 * 1024;
const MAX_PER_CLASS = 100;

/** Custom ":name:" emoji that a class uploads for itself. */
export function createEmojiService(db, config, { classes }) {
  const dir = path.join(config.uploadDir, "emoji");
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, `${randomId(12)}${TYPES[file.mimetype] ?? ""}`),
    }),
    limits: { fileSize: MAX_BYTES, files: 1, fields: 3 },
    fileFilter: (req, file, cb) => cb(TYPES[file.mimetype] ? null : badRequest("Emoji must be a PNG, GIF, WebP or JPEG image."), !!TYPES[file.mimetype]),
  });

  const dto = (e) => ({ id: e.id, name: e.name, url: `/api/emoji/${e.id}`, createdBy: e.created_by });
  const unlink = (stored) => fs.promises.unlink(path.join(dir, stored)).catch(() => {});

  return {
    middleware: upload.single("file"),

    list(classId) {
      return db.all("SELECT * FROM class_emojis WHERE class_id = ? ORDER BY name", classId).map(dto);
    },

    add(classId, userId, file, rawName) {
      try {
        classes.requireMember(classId, userId);
        if (!file) throw badRequest("Choose an image for the emoji.");
        const name = String(rawName ?? "").trim().toLowerCase().replace(/^:|:$/g, "");
        if (!NAME.test(name)) throw badRequest("Emoji names use 2–24 lowercase letters, numbers or _ (e.g. teacher_mug).");
        if (db.get("SELECT 1 FROM class_emojis WHERE class_id = ? AND name = ?", classId, name)) throw conflict(`:${name}: already exists.`);
        if (db.get("SELECT COUNT(*) AS n FROM class_emojis WHERE class_id = ?", classId).n >= MAX_PER_CLASS) {
          throw badRequest(`This class already has ${MAX_PER_CLASS} emoji. Remove some first.`);
        }
        const { lastInsertRowid } = db.run(
          "INSERT INTO class_emojis (class_id, name, stored_name, mime, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          classId, name, file.filename, file.mimetype, userId, now(),
        );
        return dto(db.get("SELECT * FROM class_emojis WHERE id = ?", Number(lastInsertRowid)));
      } catch (err) {
        if (file?.filename) unlink(file.filename);
        throw err;
      }
    },

    /** Teachers can remove any emoji; others only the ones they added. */
    remove(classId, userId, name) {
      const m = classes.requireMember(classId, userId);
      const e = db.get("SELECT * FROM class_emojis WHERE class_id = ? AND name = ?", classId, name);
      if (!e) throw notFound("Emoji not found.");
      if (!isStaff(m.role) && e.created_by !== userId) throw forbidden("Only teachers or the person who added it can remove this emoji.");
      db.run("DELETE FROM class_emojis WHERE id = ?", e.id);
      unlink(e.stored_name);
    },

    resolve(emojiId, userId) {
      const e = db.get("SELECT * FROM class_emojis WHERE id = ?", emojiId);
      if (!e || !classes.membership(e.class_id, userId)) throw notFound("Emoji not found.");
      return { path: path.join(dir, e.stored_name), mime: e.mime };
    },
  };
}
