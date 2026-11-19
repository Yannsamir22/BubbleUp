// What a countdown says right now. Dates are calendar days in the viewer's local time.

const DAY = 864e5;

function emojiFor(days) {
  if (days <= 14) return "😬";
  if (days <= 60) return "⏳";
  return "📅";
}

/**
 * { state: "ahead" | "tomorrow" | "today" | "past", days, headline, emoji, when, soon }
 * `soon` is "in 2 h 15 min" on the day itself when a time was given.
 */
export function countdownView({ title, date, time }, now = new Date()) {
  const [y, mo, d] = date.split("-").map(Number);
  const day = new Date(y, mo - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day - today) / DAY); // round: days around a clock change are 23 or 25 hours
  const when =
    day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + (time ? ` at ${time}` : "");

  if (days > 1) return { state: "ahead", days, headline: `${days} days until ${title}`, emoji: emojiFor(days), when, soon: null };
  if (days === 1) return { state: "tomorrow", days, headline: `Tomorrow: ${title}`, emoji: "😱", when, soon: null };
  if (days === 0) {
    let soon = null;
    if (time) {
      const [hh, mm] = time.split(":").map(Number);
      const mins = Math.ceil((new Date(y, mo - 1, d, hh, mm) - now) / 60000);
      if (mins > 0) soon = mins >= 60 ? `in ${Math.floor(mins / 60)} h ${mins % 60} min` : `in ${mins} min`;
    }
    return { state: "today", days, headline: `Today: ${title}`, emoji: "🎯", when, soon };
  }
  const short = day.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return { state: "past", days, headline: `${title} was on ${short}`, emoji: "✅", when, soon: null };
}
