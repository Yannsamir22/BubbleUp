import crypto from "node:crypto";
import { parseCountdown } from "../lib/countdown.js";
import { calculate } from "./calc.js";
import { KnowledgeBase, normalize } from "./knowledge.js";
import { BOT } from "./persona.js";
import { now } from "../lib/util.js";

const JOKES = [
  "Why did the student eat their homework? Because the teacher said it was a piece of cake",
  "Why was the math book sad? It had too many problems",
  "Parallel lines have so much in common. It's a shame they'll never meet",
  "Why don't scientists trust atoms? Because they make up everything",
  "I told my computer I needed a break. It said: 'No problem, I'll go to sleep'",
  "What do you call a bear with no teeth? A gummy bear",
  "Why did the scarecrow win an award? He was outstanding in his field",
  "How does a computer get drunk? It takes screenshots",
  "Why was the equal sign so humble? It knew it wasn't less than or greater than anyone else",
  "What's a teacher's favourite nation? Expla-nation",
  "Why did the music teacher need a ladder? To reach the high notes",
  "I'm reading a book about anti-gravity. It's impossible to put down",
];
const EIGHT_BALL = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "Most likely.", "Signs point to yes.",
  "Reply hazy, try again.", "Ask again after lunch.", "Better not tell you now.", "Cannot predict now.",
  "Don't count on it.", "My sources say no.", "Very doubtful.", "Only if you finish your homework first.",
];
const CONFUSED = [
  "I don't know that one yet. A teacher can teach me with /learn question :: answer",
  "Sorry, I don't have an answer for that. Try asking a classmate or your teacher.",
  "I'm not sure. Try rephrasing your question, or type /help to see what I can do.",
];

export const COMMANDS = [
  { name: "help", usage: "/help", description: "Show everything I can do" },
  { name: "ask", usage: "/ask <question>", description: "Ask Thinkmas a question (or just mention @thinkmas)" },
  { name: "calc", usage: "/calc <expression>", description: "Calculate things, e.g. /calc sqrt(16) * 2" },
  { name: "define", usage: "/define <word>", description: "Look up an English word" },
  { name: "image", usage: "/image <search>", description: "Find a picture" },
  { name: "poll", usage: "/poll Question | Option A | Option B", description: "Start a quick poll" },
  { name: "pick", usage: "/pick [a, b, c]", description: "Spin the wheel: picks a random online student (or one of your options)" },
  { name: "chess", usage: "/chess @name", description: "Challenge a classmate to chess" },
  { name: "imposter", usage: "/imposter [category]", description: "Start a game of Imposter: find who doesn't know the secret word" },
  { name: "countdown", usage: "/countdown <name> <YYYY-MM-DD>", description: "Post a live countdown (pinned when a teacher posts it)" },
  { name: "awards", usage: "/awards", description: "See this week's class awards so far" },
  { name: "roll", usage: "/roll [2d6]", description: "Roll dice" },
  { name: "flip", usage: "/flip", description: "Flip a coin" },
  { name: "8ball", usage: "/8ball <question>", description: "Ask the magic 8-ball" },
  { name: "joke", usage: "/joke", description: "Tell a (bad) joke" },
  { name: "shrug", usage: "/shrug [text]", description: "Append ¯\\_(ツ)_/¯" },
  { name: "tableflip", usage: "/tableflip [text]", description: "(╯°□°)╯︵ ┻━┻" },
  { name: "me", usage: "/me <action>", description: "Say something in third person" },
  { name: "learn", usage: "/learn question :: answer", description: "Teach me an answer", staffOnly: true },
];

const pick = (list) => list[crypto.randomInt(list.length)];

/**
 * Parses slash commands and produces one of:
 *  - { type: "transform", body }           → post the rewritten text as the user
 *  - { type: "ephemeral", text }           → only the sender sees the reply (not stored)
 *  - { type: "poll", poll }                → post a poll as the user
 *  - { type: "public", reply: Promise<string | {body, meta}> } → post the user's text, then Thinkmas replies to it
 *  - { type: "chess", username }           → the route creates a chess challenge
 *  - { type: "imposter", category }        → the route posts an Imposter lobby
 *  - { type: "countdown", countdown }      → the route posts (and maybe pins) a live countdown
 */
export function createBot(db, config, { fetchImpl = globalThis.fetch, awards } = {}) {
  /** Random pick from a typed list, or from the class's students (online ones first). */
  function randomPick(classId, args, isOnline) {
    let options;
    if (args) {
      options = args.split(/,|\n/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
      if (options.length < 2) return { error: "Give me at least two options separated by commas, e.g. /pick pizza, pasta, rice" };
    } else {
      const students = db.all(
        `SELECT u.id, u.username, u.display_name FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.class_id = ? AND m.role = 'student' ORDER BY u.display_name`,
        classId,
      );
      const online = students.filter((s) => isOnline?.(s.id));
      const pool = online.length >= 2 ? online : students;
      if (pool.length < 2) return { error: "I need at least two students in the class to pick from. You can also give me options: /pick a, b, c" };
      options = pool.map((s) => ({ label: s.display_name, username: s.username }));
    }
    const winner = crypto.randomInt(options.length);
    const labels = options.map((o) => (typeof o === "string" ? o : o.label));
    const w = options[winner];
    const body = typeof w === "string" ? `🎯 The wheel picked: **${w}**` : `🎯 The wheel picked: **${w.label}** (@${w.username})`;
    return { body, meta: { type: "pick", options: labels, winner } };
  }

  const base = KnowledgeBase.loadDefault();
  const learned = new Map(); // classId -> KnowledgeBase (lazy)

  function classKnowledge(classId) {
    if (!learned.has(classId)) {
      learned.set(classId, new KnowledgeBase(db.all("SELECT question, answer FROM knowledge WHERE class_id = ?", classId)));
    }
    return learned.get(classId);
  }

  async function getJson(url, init) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  const bot = {
    ask(classId, question) {
      const q = question.trim();
      if (!q) return "Yes? Ask me a question, or type /help to see what I can do.";
      const hit = classKnowledge(classId).find(q, 0.6) ?? base.find(q);
      return hit ? hit.answer : pick(CONFUSED);
    },

    async define(word) {
      if (!word) return "Usage: /define <word>";
      try {
        const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const entry = data?.[0];
        const meanings = (entry?.meanings ?? []).slice(0, 2).map((m) => {
          const def = m.definitions?.[0];
          return `*${m.partOfSpeech}* — ${def?.definition}${def?.example ? `\n> ${def.example}` : ""}`;
        });
        if (!meanings.length) throw new Error("empty");
        return `**${entry.word}**${entry.phonetic ? ` ${entry.phonetic}` : ""}\n${meanings.join("\n")}`;
      } catch (err) {
        if (err.status === 404 || err.message === "empty") return `I couldn't find "${word}" in the dictionary. Check the spelling?`;
        return "The dictionary service isn't responding. Try again later.";
      }
    },

    async image(query) {
      if (!query) return "Usage: /image <search>";
      if (!config.pexelsApiKey) {
        return "Image search isn't set up on this server (it needs a PEXELS_API_KEY). You can still upload pictures with the paperclip button.";
      }
      try {
        const data = await getJson(`https://api.pexels.com/v1/search?per_page=1&query=${encodeURIComponent(query)}`, {
          headers: { Authorization: config.pexelsApiKey },
        });
        const photo = data?.photos?.[0];
        if (!photo) return `No pictures found for "${query}".`;
        return `"${query}" (photo by ${photo.photographer} on Pexels)\n${photo.src.large}`;
      } catch {
        return "Image search isn't responding. Try again later.";
      }
    },

    learn(classId, userId, text) {
      const [q, a] = text.split("::").map((s) => s?.trim());
      if (!q || !a) return { ok: false, text: "Usage: /learn question :: answer" };
      db.run(
        "INSERT INTO knowledge (class_id, question, answer, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        classId, q.slice(0, 300), a.slice(0, 1000), userId, now(),
      );
      classKnowledge(classId).add([{ question: q, answer: a }]);
      return { ok: true, text: `Saved. When someone asks "${q}", I'll answer: "${a}"` };
    },

    /** Does this normal message talk to Thinkmas? Returns the question, or null. */
    mention(body) {
      const m = body.match(/(^|\s)@thinkmas\b[,:]?\s*(.*)$/is);
      return m ? m[2] || body.replace(/@thinkmas/gi, "") : null;
    },

    handle(body, { classId, userId, isStaff, isOnline }) {
      const match = body.match(/^\/([a-z0-9]+)(?:\s+([\s\S]*))?$/i);
      if (!match) return null;
      const name = match[1].toLowerCase();
      const args = (match[2] ?? "").trim();

      switch (name) {
        case "help": {
          const lines = COMMANDS.filter((c) => !c.staffOnly || isStaff).map((c) => `\`${c.usage}\` — ${c.description}`);
          return {
            type: "ephemeral",
            text: `**${BOT.displayName} commands**\n${lines.join("\n")}`,
          };
        }
        case "shrug":
          return { type: "transform", body: `${args} ¯\\_(ツ)_/¯`.trim() };
        case "tableflip":
          return { type: "transform", body: `${args} (╯°□°)╯︵ ┻━┻`.trim() };
        case "me":
          return args ? { type: "transform", body: `_${args}_` } : { type: "ephemeral", text: "Usage: /me <action>" };
        case "poll": {
          const parts = args.split("|").map((s) => s.trim()).filter(Boolean);
          if (parts.length < 3) return { type: "ephemeral", text: "Usage: /poll Question | Option A | Option B (up to 10 options)" };
          return { type: "poll", poll: { question: parts[0], options: parts.slice(1, 11) } };
        }
        case "pick": {
          const res = randomPick(classId, args, isOnline);
          if (res.error) return { type: "ephemeral", text: res.error };
          return { type: "public", reply: Promise.resolve(res) };
        }
        case "chess": {
          const m = args.match(/^@?([a-zA-Z0-9_.-]{3,20})$/);
          if (!m) return { type: "ephemeral", text: "Usage: /chess @username (or use the Games button next to the message box)" };
          return { type: "chess", username: m[1] };
        }
        case "countdown": {
          const countdown = parseCountdown(args);
          if (countdown.error) return { type: "ephemeral", text: countdown.error };
          return { type: "countdown", countdown };
        }
        case "imposter":
          return { type: "imposter", category: args || undefined };
        case "awards": {
          if (!awards) return { type: "ephemeral", text: "Awards aren't available." };
          const winners = awards.compute(classId);
          if (!isStaff || winners.length === 0) return { type: "ephemeral", text: awards.format(winners, { preview: true }) };
          return { type: "public", reply: Promise.resolve(awards.format(winners)) };
        }
        case "learn": {
          if (!isStaff) return { type: "ephemeral", text: "Only teachers can use /learn." };
          const res = bot.learn(classId, userId, args);
          return { type: "ephemeral", text: res.text };
        }
        case "calc": {
          let text;
          try {
            text = `\`${args}\` = **${calculate(args)}**`;
          } catch (err) {
            text = `Can't calculate that: ${err.message}`;
          }
          return { type: "public", reply: Promise.resolve(text) };
        }
        case "roll": {
          const dm = (args || "1d6").match(/^(\d{1,2})?d(\d{1,4})$/i);
          if (!dm) return { type: "ephemeral", text: "Usage: /roll 2d6 (up to 20 dice with up to 1000 sides)" };
          const count = Math.min(Math.max(Number(dm[1] ?? 1), 1), 20);
          const sides = Math.min(Math.max(Number(dm[2]), 2), 1000);
          const rolls = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
          const total = rolls.reduce((a, b) => a + b, 0);
          return {
            type: "public",
            reply: Promise.resolve(`Rolled ${count}d${sides}: ${rolls.join(" + ")}${count > 1 ? ` = **${total}**` : ""}`),
          };
        }
        case "flip":
          return { type: "public", reply: Promise.resolve(pick(["Coin flip: **heads**", "Coin flip: **tails**"])) };
        case "8ball":
          if (!args) return { type: "ephemeral", text: "Ask the 8-ball a yes/no question: /8ball Will we have a test?" };
          return { type: "public", reply: Promise.resolve(`The 8-ball says: ${pick(EIGHT_BALL)}`) };
        case "joke":
          return { type: "public", reply: Promise.resolve(pick(JOKES)) };
        case "ask":
          return { type: "public", reply: Promise.resolve(bot.ask(classId, args)) };
        case "define":
          return { type: "public", reply: bot.define(args.split(/\s+/)[0] ?? "") };
        case "image":
          return { type: "public", reply: bot.image(args) };
        default:
          return { type: "ephemeral", text: `I don't know /${name}. Type /help to see the commands.` };
      }
    },
  };
  return bot;
}

export { normalize };
