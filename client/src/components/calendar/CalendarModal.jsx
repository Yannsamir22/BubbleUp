import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Trash2 } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Button, Modal } from "../ui/primitives.jsx";

const DAY = 24 * 60 * 60 * 1000;
const EMPTY_EVENTS = [];

function defaultStart() {
  const date = new Date(Date.now() + DAY);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(timestamp));
}

export function CalendarModal({ classId, className, role, onClose }) {
  const events = useStore((s) => s.calendarEvents[classId] ?? EMPTY_EVENTS);
  const meId = useStore((s) => s.me?.id);
  const staff = role === "teacher" || role === "owner";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = useStore.getState;

  useEffect(() => {
    s().loadCalendar(classId).catch((err) => s().toast(err.message, "error"));
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    const timestamp = new Date(startsAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      setError("Choose a date and time in the future.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await s().createCalendarEvent(classId, { title, description, startsAt: timestamp });
      setTitle("");
      setDescription("");
      setStartsAt(defaultStart());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event) {
    try {
      await s().deleteCalendarEvent(classId, event.id);
    } catch (err) {
      s().toast(err.message, "error");
    }
  }

  return (
    <Modal title={`${className} calendar`} subtitle="Upcoming class events and due dates. A reminder is sent to the class 24 hours before each event." onClose={onClose} wide>
      {staff && (
        <form className="calendar-create" onSubmit={create}>
          <label className="field">
            <span className="field-label">Event title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Biology test" required />
          </label>
          <label className="field">
            <span className="field-label">Date and time</span>
            <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Details (optional)</span>
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Room, chapters to review, or other details" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <Button variant="primary" type="submit" loading={busy} disabled={!title.trim()}>Add to calendar</Button>
        </form>
      )}

      <section className="calendar-events" aria-label="Upcoming events">
        <h3>Upcoming</h3>
        {events.length === 0 ? (
          <div className="calendar-empty">
            <CalendarDays size={24} />
            <span>No upcoming events yet.</span>
          </div>
        ) : (
          events.map((event) => {
            const canDelete = staff || event.createdBy.id === meId;
            const soon = event.startsAt - Date.now() <= DAY;
            return (
              <article className="calendar-event" key={event.id}>
                <div className="calendar-event-icon"><CalendarDays size={19} /></div>
                <div className="calendar-event-content">
                  <strong>{event.title}</strong>
                  <span className="calendar-event-time"><Clock3 size={14} /> {formatDate(event.startsAt)}</span>
                  {event.description && <p>{event.description}</p>}
                  <span className="calendar-event-author">Added by {event.createdBy.displayName}</span>
                </div>
                {soon && <span className="role-tag">Soon</span>}
                {canDelete && (
                  <Button variant="ghost" size="sm" aria-label={`Delete ${event.title}`} title="Delete event" onClick={() => remove(event)}>
                    <Trash2 size={15} />
                  </Button>
                )}
              </article>
            );
          })
        )}
      </section>
    </Modal>
  );
}
