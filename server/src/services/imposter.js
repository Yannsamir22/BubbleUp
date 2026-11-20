import crypto from "node:crypto";
import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { now, pick } from "../lib/util.js";
import { isStaff } from "./classes.js";
import { publicUser } from "./users.js";
import { IMPOSTER_CATEGORIES, IMPOSTER_WORDS } from "./imposterWords.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const MAX_IMPOSTERS = 3;
export const ROUNDS = 2;
const MAX_CLUE_WORDS = 3;

const imposterCountSchema = z.number().int().min(1).max(MAX_IMPOSTERS).default(1);
const createSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("random"), category: z.string().trim().max(40).optional(), imposterCount: imposterCountSchema }),
  z.object({
    mode: z.literal("custom"),
    category: z.string().trim().min(1, "Give the category, e.g. Animals").max(40),
    word: z.string().trim().min(1, "Type the secret word").max(40),
    imposterCount: imposterCountSchema,
  }),
]);
const clueSchema = z.object({ text: z.string().trim().min(1, "Type a clue").max(30, "Keep your clue under 30 characters") });
const voteSchema = z.object({ targetId: z.number().int().positive() });
const guessSchema = z.object({ text: z.string().trim().min(1, "Type your guess").max(40) });

/** Lowercase, no accents, no punctuation, single spaces: "Ice-Cream!" → "ice cream". */
export function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const singular = (w) => w.replace(/(es|s)$/, "");

/** Same word, ignoring case, accents, spaces/dashes and a plural ending. */
export function sameWord(a, b) {
  const x = normalize(a).replace(/ /g, "");
  const y = normalize(b).replace(/ /g, "");
  return !!x && (x === y || singular(x) === singular(y));
}

/** Does this clue give the secret word away (the word itself, its plural, or written inside the clue)? */
export function revealsWord(clue, word) {
  const c = normalize(clue);
  const w = normalize(word);
  if (!w) return false;
  if (` ${c} `.includes(` ${w} `)) return true;
  if (sameWord(c, w)) return true;
  return c.split(" ").some((t) => sameWord(t, w));
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The Imposter word game. Everyone except the imposters gets the same secret word;
 * players take turns giving short clues for ROUNDS rounds, then vote on who the imposter is.
 * A caught imposter gets one guess at the word to win for the team.
 *
 * The server is the referee and the only place the secret lives. Two views are built from a row:
 *  - publicDto: safe for everyone (chat card, broadcasts, spectators) — no word, no imposter until revealed;
 *  - me(): the viewer's own secret (their role and, for non-imposters, the word).
 */
export function createImposterService(db, { channels, classes, messages }) {
  const userById = (id) => publicUser(db.get("SELECT * FROM users WHERE id = ?", id));

  function row(gameId) {
    const g = db.get("SELECT * FROM imposter_games WHERE id = ?", gameId);
    if (!g) throw notFound("Game not found.");
    return g;
  }

  /** Loads a game the user may see (same rules as its channel). */
  function visible(gameId, userId) {
    const g = row(gameId);
    const { channel, membership } = channels.access(g.channel_id, userId);
    return { g, channel, membership };
  }

  /** Writes fields, bumps the version (clients ignore anything older) and returns the fresh row. */
  function save(gameId, fields) {
    const keys = Object.keys(fields);
    db.run(
      `UPDATE imposter_games SET ${keys.map((k) => `${k} = ?`).join(", ")}, version = version + 1, updated_at = ? WHERE id = ?`,
      ...keys.map((k) => fields[k]),
      now(),
      gameId,
    );
    return row(gameId);
  }

  const state = (g) => ({ players: JSON.parse(g.players), clues: JSON.parse(g.clues), votes: JSON.parse(g.votes) });
  const imposters = (g) => (g.imposter_ids ? JSON.parse(g.imposter_ids) : g.imposter_id ? [g.imposter_id] : []);

  function assertManager(g, userId, membership) {
    if (g.host_id !== userId && !isStaff(membership.role)) throw forbidden("Only the person who started the game (or a teacher) can do that.");
  }

  function resolveCategory(name) {
    if (!name || /^(any|random)$/i.test(name)) return pick(IMPOSTER_CATEGORIES);
    const found = IMPOSTER_CATEGORIES.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!found) throw badRequest(`Unknown category. Choose one of: ${IMPOSTER_CATEGORIES.join(", ")}.`);
    return found;
  }

  /** After a clue (or a skip): next player, next round, or on to voting. */
  function nextTurn(g, players) {
    let turn = g.turn + 1;
    let round = g.round;
    if (turn >= players.length) {
      turn = 0;
      round += 1;
    }
    return round > ROUNDS ? { turn: 0, round: ROUNDS, status: "voting" } : { turn, round };
  }

  /** Counts the votes. Only a clear majority on an imposter catches them; a tie or a wrong pick lets the team win. */
  function tally(g, votes) {
    const counts = new Map();
    for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    const top = [...counts].filter(([, n]) => n === best).map(([id]) => id);
    if (best === 0) return { status: "finished", result: "imposter", reason: "no_votes", accused_id: null };
    if (top.length > 1) return { status: "finished", result: "imposter", reason: "tie", accused_id: null };
    if (!imposters(g).includes(top[0])) return { status: "finished", result: "imposter", reason: "wrong_vote", accused_id: top[0] };
    return { status: "guess", accused_id: top[0] };
  }

  const service = {
    categories: IMPOSTER_CATEGORIES,

    /** Everything safe to show to anyone who can see the channel. */
    publicDto(g) {
      const { players, clues, votes } = state(g);
      const over = g.status === "finished" || g.status === "cancelled";
      const team = imposters(g);
      const started = team.length > 0;
      const votingDone = g.status === "guess" || g.status === "finished";
      return {
        id: g.id,
        channelId: g.channel_id,
        messageId: g.message_id,
        host: userById(g.host_id),
        hostPlays: !!g.host_plays,
        status: g.status,
        category: g.category,
        players: players.map(userById).filter(Boolean),
        minPlayers: Math.max(MIN_PLAYERS, g.imposter_count + 2),
        maxPlayers: MAX_PLAYERS,
        imposterCount: g.imposter_count,
        rounds: ROUNDS,
        round: g.round,
        turnUserId: g.status === "clues" ? players[g.turn] : null,
        clues,
        votedUserIds: g.status === "voting" ? Object.keys(votes).map(Number) : [],
        votes: votingDone ? Object.entries(votes).map(([voterId, targetId]) => ({ voterId: Number(voterId), targetId })) : [],
        accusedId: g.accused_id,
        // Revealed once the imposter is caught (guess phase) or the game is over.
        imposterId: g.status === "guess" ? g.accused_id : over && started ? g.imposter_id ?? team[0] : null,
        imposterIds: over && started ? team : [],
        word: over && started ? g.word : null,
        guess: g.guess,
        result: g.result,
        reason: g.reason,
        version: g.version,
        updatedAt: g.updated_at,
      };
    },

    /** The viewer's own secret: their role and, unless they are the imposter, the word. */
    me(g, userId) {
      const players = JSON.parse(g.players);
      const isPlayer = players.includes(userId);
      const isMaster = !g.host_plays && g.host_id === userId;
      const isImposter = imposters(g).includes(userId);
      if (isMaster) return { role: "host", word: g.word };
      if (!isPlayer) return { role: "spectator", word: null };
      if (g.status === "lobby") return { role: "player", word: null };
      // Your own vote is yours to see; everyone's votes are shown once voting closes.
      const vote = g.status === "voting" ? JSON.parse(g.votes)[userId] ?? null : null;
      if (isImposter) return { role: "imposter", word: null, vote };
      return { role: "player", word: g.word, vote };
    },

    dto(g, userId) {
      return { ...this.publicDto(g), me: this.me(g, userId) };
    },

    /** Everyone who has a secret to receive when the game starts. */
    participants(g) {
      const ids = new Set(JSON.parse(g.players));
      if (!g.host_plays) ids.add(g.host_id);
      return [...ids];
    },

    view(gameId, userId) {
      return this.dto(visible(gameId, userId).g, userId);
    },

    /** Public DTOs for games attached to these messages (used when hydrating chat history). */
    forMessages(messageIds) {
      if (!messageIds.length) return new Map();
      const rows = db.all("SELECT * FROM imposter_games WHERE message_id IN (SELECT value FROM json_each(?))", JSON.stringify(messageIds));
      return new Map(rows.map((g) => [g.message_id, this.publicDto(g)]));
    },

    /** Posts a lobby card. "random": the host plays and the server picks the word. "custom": the host types it and runs the game. */
    create(channelId, userId, input) {
      const opts = parse(createSchema, input);
      const { channel, membership } = channels.access(channelId, userId);
      channels.assertCanPost(channel, membership);
      if (channel.kind === "dm") throw badRequest(`Imposter needs at least ${MIN_PLAYERS} players. Start it in a class channel.`);

      let category, word;
      if (opts.mode === "random") {
        category = resolveCategory(opts.category);
        word = pick(IMPOSTER_WORDS[category]);
      } else {
        category = opts.category;
        word = opts.word;
      }
      const hostPlays = opts.mode === "random";
      const minPlayers = Math.max(MIN_PLAYERS, opts.imposterCount + 2);

      return db.tx(() => {
        const t = now();
        const { lastInsertRowid } = db.run(
          `INSERT INTO imposter_games (class_id, channel_id, host_id, host_plays, category, word, status, players, imposter_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'lobby', ?, ?, ?, ?)`,
          channel.class_id, channelId, userId, hostPlays ? 1 : 0, category, word, JSON.stringify(hostPlays ? [userId] : []), opts.imposterCount, t, t,
        );
        const gameId = Number(lastInsertRowid);
        const teamLabel = `${opts.imposterCount} imposter${opts.imposterCount === 1 ? "" : "s"}`;
        const body = `🕵️ Who wants to play Imposter? Category: ${category}. ${teamLabel}. Join the game! (${minPlayers}–${MAX_PLAYERS} players)`;
        const messageId = messages.createWithMeta(channelId, userId, body, { type: "imposter", gameId });
        db.run("UPDATE imposter_games SET message_id = ? WHERE id = ?", messageId, gameId);
        return { gameId, messageId, channel };
      });
    },

    join(gameId, userId) {
      const { g, channel, membership } = visible(gameId, userId);
      if (g.status !== "lobby") throw badRequest("This game has already started. You can still watch it.");
      if (!g.host_plays && g.host_id === userId) throw badRequest("You're the game master here, so you don't play.");
      channels.assertCanPost(channel, membership);
      const { players } = state(g);
      if (players.includes(userId)) throw badRequest("You're already in this game.");
      if (players.length >= MAX_PLAYERS) throw badRequest(`This game is full (${MAX_PLAYERS} players).`);
      return { g: save(gameId, { players: JSON.stringify([...players, userId]) }), channel };
    },

    leave(gameId, userId) {
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "lobby") throw badRequest("You can only leave before the game starts.");
      if (g.host_id === userId) throw badRequest("You started this game. Cancel it instead.");
      const { players } = state(g);
      if (!players.includes(userId)) throw badRequest("You're not in this game.");
      return { g: save(gameId, { players: JSON.stringify(players.filter((p) => p !== userId)) }), channel };
    },

    start(gameId, userId) {
      const { g, channel, membership } = visible(gameId, userId);
      assertManager(g, userId, membership);
      if (g.status !== "lobby") throw badRequest("This game has already started.");
      const { players } = state(g);
      const minPlayers = Math.max(MIN_PLAYERS, g.imposter_count + 2);
      if (players.length < minPlayers) throw badRequest(`You need at least ${minPlayers} players to start with ${g.imposter_count} imposters.`);
      const order = shuffle(players);
      const team = shuffle(order).slice(0, g.imposter_count);
      const fresh = save(gameId, {
        players: JSON.stringify(order),
        imposter_id: team[0],
        imposter_ids: JSON.stringify(team),
        status: "clues",
        round: 1,
        turn: 0,
      });
      return { g: fresh, channel, started: true };
    },

    clue(gameId, userId, input) {
      const { text } = parse(clueSchema, input);
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "clues") throw badRequest("It's not time for clues right now.");
      const { players, clues } = state(g);
      if (!players.includes(userId)) throw forbidden("You're watching this game, not playing it.");
      if (players[g.turn] !== userId) throw badRequest("It's not your turn yet.");
      const clean = text.replace(/\s+/g, " ");
      if (clean.split(" ").length > MAX_CLUE_WORDS) throw badRequest(`Keep it short: up to ${MAX_CLUE_WORDS} words.`);
      // Only someone who knows the word is told it's in their clue — telling the imposter would leak it.
      if (!imposters(g).includes(userId) && revealsWord(clean, g.word)) throw badRequest("That gives the secret word away! Try another clue.");
      clues.push({ userId, text: clean, round: g.round });
      return { g: save(gameId, { clues: JSON.stringify(clues), ...nextTurn(g, players) }), channel };
    },

    vote(gameId, userId, input) {
      const { targetId } = parse(voteSchema, input);
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "voting") throw badRequest("Voting isn't open right now.");
      const { players, votes } = state(g);
      if (!players.includes(userId)) throw forbidden("Only players can vote.");
      if (!players.includes(targetId)) throw badRequest("That person isn't playing.");
      if (targetId === userId) throw badRequest("You can't vote for yourself.");
      votes[userId] = targetId;
      const done = players.every((p) => votes[p] !== undefined);
      return { g: save(gameId, { votes: JSON.stringify(votes), ...(done ? tally(g, votes) : {}) }), channel };
    },

    guess(gameId, userId, input) {
      const { text } = parse(guessSchema, input);
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "guess") throw badRequest("There's nothing to guess right now.");
      if (g.accused_id !== userId || !imposters(g).includes(userId)) throw forbidden("Only the caught imposter guesses the word.");
      const right = sameWord(text, g.word);
      return {
        g: save(gameId, { guess: text, status: "finished", result: right ? "imposter" : "players", reason: right ? "guessed" : "caught" }),
        channel,
      };
    },

    /** Host or teacher keeps a stuck game moving: skip the current clue, close voting, or end the guess. */
    advance(gameId, userId) {
      const { g, channel, membership } = visible(gameId, userId);
      assertManager(g, userId, membership);
      const { players, clues, votes } = state(g);
      if (g.status === "clues") {
        clues.push({ userId: players[g.turn], text: null, round: g.round, skipped: true });
        return { g: save(gameId, { clues: JSON.stringify(clues), ...nextTurn(g, players) }), channel };
      }
      if (g.status === "voting") return { g: save(gameId, tally(g, votes)), channel };
      if (g.status === "guess") return { g: save(gameId, { status: "finished", result: "players", reason: "no_guess" }), channel };
      throw badRequest("There's nothing to skip right now.");
    },

    cancel(gameId, userId) {
      const { g, channel, membership } = visible(gameId, userId);
      assertManager(g, userId, membership);
      if (g.status === "finished" || g.status === "cancelled") throw badRequest("This game is already over.");
      return { g: save(gameId, { status: "cancelled" }), channel };
    },
  };
  return service;
}
