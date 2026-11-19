import { now } from "../lib/util.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SCORE = 2; // nobody wins "Night owl" for a single late message

/** ISO week key like "2026-W47" (used so each week's awards are posted once). */
export function isoWeek(ts = Date.now()) {
  const local = new Date(ts);
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const AWARDS = [
  { key: "chatterbox", icon: "💬", title: "Chatterbox", unit: "messages" },
  { key: "helpful", icon: "🙌", title: "Most helpful in #homework", unit: "reactions on their answers" },
  { key: "favourite", icon: "⭐", title: "Crowd favourite", unit: "reactions received" },
  { key: "emoji", icon: "😂", title: "Emoji champion", unit: "reactions given" },
  { key: "questions", icon: "❓", title: "Question master", unit: "questions asked" },
  { key: "owl", icon: "🦉", title: "Night owl", unit: "messages after 10 pm" },
  { key: "polls", icon: "📊", title: "Poll enthusiast", unit: "polls started" },
];

/**
 * Fun weekly awards computed from the last 7 days of public class activity
 * (private messages are never counted).
 */
export function createAwardsService(db) {
  function topBy(map) {
    let best = null;
    for (const [userId, score] of map) if (score >= MIN_SCORE && (!best || score > best.score)) best = { userId, score };
    return best;
  }
  const bump = (map, id, n = 1) => map.set(id, (map.get(id) ?? 0) + n);

  return {
    compute(classId, until = now()) {
      const since = until - WEEK_MS;
      const msgs = db.all(
        `SELECT m.id, m.user_id, m.body, m.created_at, c.name AS channel
           FROM messages m JOIN channels c ON c.id = m.channel_id
          WHERE c.class_id = ? AND c.kind <> 'dm' AND m.kind = 'user' AND m.deleted_at IS NULL
            AND m.created_at BETWEEN ? AND ?`,
        classId, since, until,
      );
      const scores = Object.fromEntries(AWARDS.map((a) => [a.key, new Map()]));
      for (const m of msgs) {
        bump(scores.chatterbox, m.user_id);
        if (m.body.includes("?") && !m.body.startsWith("/")) bump(scores.questions, m.user_id);
        const hour = new Date(m.created_at).getHours();
        if (hour >= 22 || hour < 5) bump(scores.owl, m.user_id);
      }
      const reactions = db.all(
        `SELECT r.user_id AS giver, m.user_id AS receiver, c.name AS channel
           FROM reactions r JOIN messages m ON m.id = r.message_id JOIN channels c ON c.id = m.channel_id
          WHERE c.class_id = ? AND c.kind <> 'dm' AND r.created_at BETWEEN ? AND ? AND m.user_id IS NOT NULL`,
        classId, since, until,
      );
      for (const r of reactions) {
        bump(scores.emoji, r.giver);
        if (r.giver === r.receiver) continue; // reacting to yourself doesn't count
        bump(scores.favourite, r.receiver);
        if (r.channel === "homework") bump(scores.helpful, r.receiver);
      }
      for (const p of db.all(
        `SELECT m.user_id FROM polls p JOIN messages m ON m.id = p.message_id JOIN channels c ON c.id = m.channel_id
          WHERE c.class_id = ? AND c.kind <> 'dm' AND m.created_at BETWEEN ? AND ?`,
        classId, since, until,
      )) {
        bump(scores.polls, p.user_id);
      }

      const winners = [];
      for (const a of AWARDS) {
        const best = topBy(scores[a.key]);
        if (!best) continue;
        const user = db.get(
          "SELECT u.username FROM users u JOIN memberships mb ON mb.user_id = u.id AND mb.class_id = ? WHERE u.id = ?",
          classId, best.userId,
        );
        if (user) winners.push({ ...a, username: user.username, score: best.score });
      }
      return winners;
    },

    format(winners, { preview = false } = {}) {
      if (winners.length === 0) {
        return preview
          ? "No awards yet this week: there hasn't been enough activity. Keep chatting!"
          : "Not enough activity this week for awards. Maybe next week!";
      }
      const lines = winners.map((w) => `${w.icon} **${w.title}**: @${w.username} (${w.score} ${w.unit})`);
      const head = preview ? "**Weekly awards so far** (only you can see this preview)" : "🏆 **This week's class awards**";
      return `${head}\n${lines.join("\n")}${preview ? "" : "\n\nCongratulations! New awards next Friday."}`;
    },

    alreadyPosted(classId, week) {
      return !!db.get("SELECT 1 FROM class_events WHERE class_id = ? AND kind = 'awards' AND key = ?", classId, week);
    },

    markPosted(classId, week) {
      db.run("INSERT OR IGNORE INTO class_events (class_id, kind, key, created_at) VALUES (?, 'awards', ?, ?)", classId, week, now());
    },
  };
}
