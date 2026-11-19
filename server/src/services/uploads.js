import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { badRequest, notFound } from "../lib/errors.js";
import { now, randomId } from "../lib/util.js";
import { attachmentDto } from "./messages.js";

/** Types a browser may render inline. Everything else is forced to download (prevents stored XSS via HTML/SVG). */
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|audio\/[\w.+-]+|video\/(mp4|webm|ogg|quicktime)|application\/pdf|text\/plain)$/;
const BLOCKED_EXT = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".vbs", ".jar", ".dll"]);
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

export function createUploadService(db, config, { channels }) {
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
      cb(null, `${randomId(18)}${ext}`);
    },
  });

  const multerUpload = multer({
    storage,
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (BLOCKED_EXT.has(ext)) return cb(badRequest("For everyone's safety, programs (.exe, .bat, …) can't be shared."));
      cb(null, true);
    },
  });

  function unlinkQuiet(storedName) {
    fs.promises.unlink(path.join(config.uploadDir, storedName)).catch(() => {});
  }

  return {
    middleware: multerUpload.single("file"),

    /** Records a freshly uploaded file. It stays an "orphan" until attached to a message. */
    record(classId, userId, file, fields = {}) {
      if (!file) throw badRequest("No file received.");
      // Browsers send "latin1"-decoded names through multipart; restore UTF-8 (é, emoji, …).
      const originalName = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 200) || "file";
      const dim = (v) => {
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) && n > 0 && n < 50_000 ? n : null;
      };
      const duration = Number.parseFloat(fields.duration);
      const publicId = randomId(12);
      db.run(
        `INSERT INTO attachments (public_id, class_id, uploader_id, original_name, stored_name, mime, size, width, height, duration, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        publicId, classId, userId, originalName, file.filename, file.mimetype || "application/octet-stream", file.size,
        dim(fields.width), dim(fields.height), Number.isFinite(duration) && duration > 0 ? duration : null, now(),
      );
      return attachmentDto(db.get("SELECT * FROM attachments WHERE public_id = ?", publicId));
    },

    discard(file) {
      if (file?.filename) unlinkQuiet(file.filename);
    },

    /** Resolves a download, enforcing the same access rules as the message it belongs to. */
    resolve(publicId, userId) {
      const a = db.get("SELECT * FROM attachments WHERE public_id = ?", publicId);
      if (!a) throw notFound("File not found.");
      if (a.message_id === null) {
        if (a.uploader_id !== userId) throw notFound("File not found.");
      } else {
        const msg = db.get("SELECT channel_id, deleted_at FROM messages WHERE id = ?", a.message_id);
        if (!msg || msg.deleted_at) throw notFound("File not found.");
        channels.access(msg.channel_id, userId);
      }
      return {
        path: path.join(config.uploadDir, a.stored_name),
        name: a.original_name,
        mime: a.mime,
        inline: INLINE_TYPES.test(a.mime),
      };
    },

    /** Removes the files of a deleted message from disk. */
    purgeMessage(messageId) {
      const rows = db.all("SELECT stored_name FROM attachments WHERE message_id = ?", messageId);
      db.run("DELETE FROM attachments WHERE message_id = ?", messageId);
      rows.forEach((r) => unlinkQuiet(r.stored_name));
    },

    /** Runs removeFn (which deletes the class) and then removes the class's files from disk. */
    purgeClass(classId, removeFn) {
      const rows = db.all("SELECT stored_name FROM attachments WHERE class_id = ?", classId);
      removeFn();
      rows.forEach((r) => unlinkQuiet(r.stored_name));
    },

    /** Deletes uploads that were never sent (e.g. user closed the tab). */
    cleanupOrphans() {
      const cutoff = now() - ORPHAN_TTL_MS;
      const rows = db.all("SELECT id, stored_name FROM attachments WHERE message_id IS NULL AND created_at < ?", cutoff);
      for (const r of rows) {
        db.run("DELETE FROM attachments WHERE id = ?", r.id);
        unlinkQuiet(r.stored_name);
      }
      return rows.length;
    },
  };
}
