import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { now } from "../lib/util.js";
import { isStaff } from "./classes.js";
import { publicUser } from "./users.js";

const DAY = 24 * 60 * 60 * 1000;
const eventSchema = z.object({
  title: z.string().trim().min(1, "Add an event title").max(100),
  description: z.string().trim().max(500).default(""),
  startsAt: z.number().int().positive(),
});

export function createCalendarService(db, { classes }) {
  function eventDto(row) {
    const creator = db.get("SELECT * FROM users WHERE id = ?", row.created_by);
    return {
      id: row.id,
      classId: row.class_id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      createdBy: publicUser(creator),
      createdAt: row.created_at,
    };
  }

  const service = {
    list(classId, userId) {
      classes.requireMember(classId, userId);
      return db
        .all("SELECT * FROM calendar_events WHERE class_id = ? AND starts_at >= ? ORDER BY starts_at, id", classId, now())
        .map(eventDto);
    },

    create(classId, userId, input) {
      classes.requireStaff(classId, userId);
      const data = parse(eventSchema, input);
      if (data.startsAt <= now()) throw badRequest("Choose a date and time in the future.");
      const createdAt = now();
      const { lastInsertRowid } = db.run(
        `INSERT INTO calendar_events (class_id, title, description, starts_at, reminder_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        classId, data.title, data.description, data.startsAt, data.startsAt - DAY, userId, createdAt,
      );
      return eventDto(db.get("SELECT * FROM calendar_events WHERE id = ?", Number(lastInsertRowid)));
    },

    remove(classId, eventId, userId) {
      const membership = classes.requireMember(classId, userId);
      const event = db.get("SELECT * FROM calendar_events WHERE id = ? AND class_id = ?", eventId, classId);
      if (!event) throw notFound("Calendar event not found.");
      if (event.created_by !== userId && !isStaff(membership.role)) throw forbidden("Only the event creator or a teacher can delete this event.");
      db.run("DELETE FROM calendar_events WHERE id = ?", eventId);
    },

    /** Claims due reminders atomically so concurrent server ticks cannot send duplicates. */
    dispatchReminders(at = now()) {
      return db.tx(() => {
        const due = db.all(
          "SELECT * FROM calendar_events WHERE reminder_sent = 0 AND reminder_at <= ? AND starts_at > ? ORDER BY reminder_at, id",
          at, at,
        );
        const sent = [];
        for (const event of due) {
          const result = db.run("UPDATE calendar_events SET reminder_sent = 1 WHERE id = ? AND reminder_sent = 0", event.id);
          if (result.changes) sent.push(eventDto({ ...event, reminder_sent: 1 }));
        }
        return sent;
      });
    },
  };
  return service;
}
