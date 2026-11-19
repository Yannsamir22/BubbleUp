// Message effects: some phrases set off confetti or balloons on everyone's screen, once per message.

const RULES = [
  { effect: "balloons", re: /\b(happy\s+(birthday|b-?day)|hbd|joyeux\s+anniversaire|feliz\s+cumplea(n|ñ)os)\b/i },
  { effect: "confetti", re: /\b(congrats|congratulations|congratz|well\s+done|bravo|f[ée]licitations)\b/i },
  {
    effect: "confetti",
    re: /\b(tests?|exams?|quiz(zes)?|homework|class(es)?|lessons?|lectures?)\s+(is\s+|are\s+|has\s+been\s+|have\s+been\s+|got\s+|was\s+|were\s+)?(cancell?ed|postponed)\b/i,
  },
  { effect: "confetti", re: /\bno\s+(homework|school|test|exam)\b/i },
];

/** Strips code and quotes, so writing about "congrats" in a code block doesn't set anything off. */
function plain(body) {
  return String(body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^>.*$/gm, " ");
}

/** "balloons", "confetti" or null. Birthdays win over congratulations. */
export function detectEffect(body) {
  const text = plain(body);
  return RULES.find((r) => r.re.test(text))?.effect ?? null;
}

export const CATCH_UP_MS = 60 * 60 * 1000;

/**
 * Which effect to play for a channel's messages: the newest unseen message with an effect,
 * sent in the last hour. Returns { effect, ids } (every unseen candidate, to mark as seen) or null.
 */
export function pickEffect(items, seen, now = Date.now()) {
  const fresh = (items ?? []).filter(
    (m) => typeof m.id === "number" && !m.deleted && !seen.has(m.id) && now - m.createdAt < CATCH_UP_MS && detectEffect(m.body),
  );
  if (!fresh.length) return null;
  const newest = fresh.reduce((a, b) => (b.id > a.id ? b : a));
  return { effect: detectEffect(newest.body), ids: fresh.map((m) => m.id) };
}
