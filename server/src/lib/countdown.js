// Countdowns: "/countdown Chemistry exam 2026-12-10 [09:00]".
// Dates are calendar days in the server's local time zone (the class's time zone in practice).

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_TITLE = 80;
const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-19" for a Date, in local time. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const COUNTDOWN_USAGE = "Usage: /countdown <name> <YYYY-MM-DD> [HH:MM], e.g. /countdown Chemistry exam 2026-12-10";

/** Returns { title, date, time } or { error }. */
export function parseCountdown(args, now = new Date()) {
  const m = String(args ?? "").match(DATE_RE);
  if (!m) return { error: COUNTDOWN_USAGE };
  const [, y, mo, d, hh, mm] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  if (day.getFullYear() !== Number(y) || day.getMonth() !== Number(mo) - 1 || day.getDate() !== Number(d)) {
    return { error: `${m[0].slice(0, 10)} isn't a real date. Use YYYY-MM-DD, e.g. 2026-12-10.` };
  }
  let time = null;
  if (hh !== undefined) {
    if (Number(hh) > 23 || Number(mm) > 59) return { error: "Use a 24-hour time like 09:00 or 14:30." };
    time = `${pad(hh)}:${mm}`;
  }
  const title = `${args.slice(0, m.index)} ${args.slice(m.index + m[0].length)}`
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, "")
    .trim();
  if (!title) return { error: `Give your countdown a name. ${COUNTDOWN_USAGE}` };
  if (title.length > MAX_TITLE) return { error: `Keep the name under ${MAX_TITLE} characters.` };

  const date = localDate(day);
  if (date < localDate(now)) return { error: "That date has already passed." };
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() + 2);
  if (date > localDate(limit)) return { error: "Pick a date within the next 2 years." };
  return { title, date, time };
}

/** Plain-text version stored as the message body (notifications, search, older clients). */
export function countdownBody({ title, date, time }) {
  const [y, mo, d] = date.split("-").map(Number);
  return `⏳ Countdown: ${title} — ${d} ${MONTHS[mo - 1]} ${y}${time ? ` at ${time}` : ""}`;
}
