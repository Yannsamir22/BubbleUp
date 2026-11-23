import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { now } from "../lib/util.js";
import { isStaff } from "./classes.js";
import { publicUser } from "./users.js";
import { WORD_CHAIN_LANGUAGES, isKnownWord, normalizeWord } from "./wordChainWords.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const LIVES = 3;
const TURN_SECONDS = [15, 30, 45, 60];
/** A word that arrives this late after the deadline still counts (network lag). */
const GRACE_MS = 1500;

const wordSchema = z.object({ word: z.string().trim().min(1, "Enter a word").max(40) });
const createSchema = z
  .object({
    language: z.enum(Object.keys(WORD_CHAIN_LANGUAGES)).default("en"),
    turnSeconds: z
      .number()
      .int()
      .refine((n) => TURN_SECONDS.includes(n), `Pick a turn time of ${TURN_SECONDS.join(", ")} seconds.`)
      .default(30),
  });

const MESSAGES = {
  en: {
    unknown: (w) => `“${w}” isn't in the English word list.`,
    letter: (w, l) => `“${w}” doesn't start with “${l}”.`,
    repeat: (w) => `“${w}” was already used.`,
  },
  fr: {
    unknown: (w) => `« ${w} » n'est pas dans la liste de mots français.`,
    letter: (w, l) => `« ${w} » ne commence pas par « ${l} ».`,
    repeat: (w) => `« ${w} » a déjà été utilisé.`,
  },
};

/**
 * Word Chain: players take turns adding a word that starts with the previous word's last letter.
 * Each player has LIVES lives. A word that isn't in the dictionary, breaks the chain or repeats a word
 * costs a life, and so does running out of time. At zero lives a player is out; the last one left wins.
 */
export function createWordChainService(db, { channels, messages }) {
  const userById = (id) => publicUser(db.get("SELECT * FROM users WHERE id = ?", id));

  function row(gameId) {
    const game = db.get("SELECT * FROM word_chain_games WHERE id = ?", gameId);
    if (!game) throw notFound("Word Chain game not found.");
    return game;
  }

  function visible(gameId, userId) {
    const game = row(gameId);
    const { channel, membership } = channels.access(game.channel_id, userId);
    return { game, channel, membership };
  }

  function save(gameId, fields) {
    const keys = Object.keys(fields);
    db.run(
      `UPDATE word_chain_games SET ${keys.map((key) => `${key} = ?`).join(", ")}, version = version + 1, updated_at = ? WHERE id = ?`,
      ...keys.map((key) => fields[key]),
      now(),
      gameId,
    );
    return row(gameId);
  }

  function assertManager(game, userId, membership) {
    if (game.host_id !== userId && !isStaff(membership.role)) throw forbidden("Only the game host or a teacher can do that.");
  }

  const alive = (players, lives) => players.filter((id) => (lives[id] ?? 0) > 0);

  /** Index of the next player still in the game after `from` (wrapping around). */
  function nextTurn(players, lives, from) {
    for (let step = 1; step <= players.length; step++) {
      const index = (from + step) % players.length;
      if ((lives[players[index]] ?? 0) > 0) return index;
    }
    return from;
  }

  /**
   * Takes lives from a player and passes the turn on. Ends the game when one player (or none) is left.
   * `reason` is "mistake", "timeout" or "forfeit".
   */
  function penalize(game, userId, reason, { word = null, detail = null, all = false, at = now() } = {}) {
    const players = JSON.parse(game.players);
    const lives = JSON.parse(game.lives);
    const outOrder = JSON.parse(game.out_order);
    lives[userId] = all ? 0 : Math.max(0, (lives[userId] ?? 0) - 1);
    const eliminated = lives[userId] === 0;
    if (eliminated && !outOrder.includes(userId)) outOrder.push(userId);

    const left = alive(players, lives);
    const event = { type: reason, userId, word, detail, livesLeft: lives[userId], eliminated, at };
    const fields = { lives: JSON.stringify(lives), out_order: JSON.stringify(outOrder), last_event: JSON.stringify(event) };
    if (left.length <= 1) {
      Object.assign(fields, { status: "finished", winner_id: left[0] ?? null, turn_deadline: null });
    } else if (players[game.turn] === userId) {
      Object.assign(fields, { turn: nextTurn(players, lives, game.turn), turn_deadline: at + game.turn_seconds * 1000 });
    }
    return save(game.id, fields);
  }

  const service = {
    dto(game) {
      const players = JSON.parse(game.players);
      const chain = JSON.parse(game.chain);
      const lives = JSON.parse(game.lives);
      const playing = game.status === "playing";
      return {
        id: game.id,
        classId: game.class_id,
        channelId: game.channel_id,
        messageId: game.message_id,
        host: userById(game.host_id),
        status: game.status,
        language: game.language,
        turnSeconds: game.turn_seconds,
        maxLives: LIVES,
        players: players.map(userById).filter(Boolean),
        lives: game.status === "lobby" ? Object.fromEntries(players.map((id) => [id, LIVES])) : lives,
        outOrder: JSON.parse(game.out_order),
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        chain: chain.map((entry) => ({ ...entry, user: userById(entry.userId) })).filter((entry) => entry.user),
        turnUserId: playing ? players[game.turn] ?? null : null,
        turnDeadline: playing ? game.turn_deadline : null,
        serverTime: now(),
        winner: game.winner_id ? userById(game.winner_id) : null,
        lastEvent: game.last_event ? JSON.parse(game.last_event) : null,
        version: game.version,
        updatedAt: game.updated_at,
      };
    },

    forMessages(messageIds) {
      if (!messageIds.length) return new Map();
      const games = db.all(
        "SELECT * FROM word_chain_games WHERE message_id IN (SELECT value FROM json_each(?))",
        JSON.stringify(messageIds),
      );
      return new Map(games.map((game) => [game.message_id, this.dto(game)]));
    },

    get(gameId, userId) {
      return this.dto(visible(gameId, userId).game);
    },

    create(channelId, userId, input = {}) {
      const { language, turnSeconds } = parse(createSchema, input ?? {});
      const { channel, membership } = channels.access(channelId, userId);
      channels.assertCanPost(channel, membership);
      if (channel.kind === "dm") throw badRequest("Word Chain is a class game. Start it in a class channel.");

      return db.tx(() => {
        const timestamp = now();
        const { lastInsertRowid } = db.run(
          `INSERT INTO word_chain_games (class_id, channel_id, host_id, status, players, language, turn_seconds, created_at, updated_at)
           VALUES (?, ?, ?, 'lobby', ?, ?, ?, ?, ?)`,
          channel.class_id, channelId, userId, JSON.stringify([userId]), language, turnSeconds, timestamp, timestamp,
        );
        const gameId = Number(lastInsertRowid);
        const text =
          language === "fr"
            ? "Qui veut jouer à la Chaîne de mots ? Rejoignez la partie !"
            : "Who wants to play Word Chain? Join the game!";
        const messageId = messages.createWithMeta(channelId, userId, text, { type: "wordChain", gameId });
        db.run("UPDATE word_chain_games SET message_id = ? WHERE id = ?", messageId, gameId);
        return { messageId, channel };
      });
    },

    join(gameId, userId) {
      const { game, channel, membership } = visible(gameId, userId);
      if (game.status !== "lobby") throw badRequest("This game has already started.");
      channels.assertCanPost(channel, membership);
      const players = JSON.parse(game.players);
      if (players.includes(userId)) throw badRequest("You're already in this game.");
      if (players.length >= MAX_PLAYERS) throw badRequest(`This game is full (${MAX_PLAYERS} players).`);
      return { game: save(gameId, { players: JSON.stringify([...players, userId]) }), channel };
    },

    leave(gameId, userId) {
      const { game, channel } = visible(gameId, userId);
      if (game.status !== "lobby") throw badRequest("You can only leave before the game starts. Give up instead.");
      if (game.host_id === userId) throw badRequest("The host can't leave. Cancel the game instead.");
      const players = JSON.parse(game.players);
      if (!players.includes(userId)) throw badRequest("You're not in this game.");
      return { game: save(gameId, { players: JSON.stringify(players.filter((id) => id !== userId)) }), channel };
    },

    start(gameId, userId) {
      const { game, channel, membership } = visible(gameId, userId);
      assertManager(game, userId, membership);
      if (game.status !== "lobby") throw badRequest("This game has already started.");
      const players = JSON.parse(game.players);
      if (players.length < MIN_PLAYERS) throw badRequest(`You need at least ${MIN_PLAYERS} players to start.`);
      const lives = Object.fromEntries(players.map((id) => [id, LIVES]));
      return {
        game: save(gameId, {
          status: "playing",
          turn: 0,
          lives: JSON.stringify(lives),
          turn_deadline: now() + game.turn_seconds * 1000,
        }),
        channel,
      };
    },

    /**
     * Plays a word. Typos in the format (spaces, digits) are rejected without penalty;
     * a word that breaks the rules costs a life and passes the turn (returned as `penalty`).
     */
    play(gameId, userId, input) {
      const { word } = parse(wordSchema, input);
      const { game, channel } = visible(gameId, userId);
      if (game.status !== "playing") throw badRequest("This game isn't being played right now.");
      const players = JSON.parse(game.players);
      const chain = JSON.parse(game.chain);
      if (!players.includes(userId)) throw forbidden("You're watching this game, not playing it.");
      if (players[game.turn] !== userId) throw badRequest("It's not your turn yet.");

      const at = now();
      if (game.turn_deadline && at > game.turn_deadline + GRACE_MS) {
        const updated = penalize(game, userId, "timeout", { at });
        return { game: updated, channel, penalty: "Time's up! You lost a life." };
      }

      const clean = word.trim();
      const normalized = normalizeWord(clean);
      if (!/^\p{L}+$/u.test(clean) || !/^[a-z]+$/.test(normalized)) {
        throw badRequest("Use one word made of letters only.");
      }

      const text = MESSAGES[game.language] ?? MESSAGES.en;
      const previous = chain.at(-1)?.word;
      const letter = previous ? normalizeWord(previous).at(-1) : null;
      let detail = null;
      if (letter && normalized[0] !== letter) detail = text.letter(clean, letter.toUpperCase());
      else if (chain.some((entry) => normalizeWord(entry.word) === normalized)) detail = text.repeat(clean);
      else if (!isKnownWord(game.language, normalized)) detail = text.unknown(clean);

      if (detail) {
        const updated = penalize(game, userId, "mistake", { word: clean, detail, at });
        const livesLeft = JSON.parse(updated.lives)[userId];
        const penalty = livesLeft > 0 ? `${detail} You lost a life (${livesLeft} left).` : `${detail} You're out!`;
        return { game: updated, channel, penalty };
      }

      chain.push({ userId, word: clean });
      const lives = JSON.parse(game.lives);
      return {
        game: save(gameId, {
          chain: JSON.stringify(chain),
          turn: nextTurn(players, lives, game.turn),
          turn_deadline: at + game.turn_seconds * 1000,
          last_event: JSON.stringify({ type: "word", userId, word: clean, at }),
        }),
        channel,
      };
    },

    /** A player gives up: they are out at once, and the turn moves on if it was theirs. */
    forfeit(gameId, userId) {
      const { game, channel } = visible(gameId, userId);
      if (game.status !== "playing") throw badRequest("This game isn't being played right now.");
      const lives = JSON.parse(game.lives);
      if (!JSON.parse(game.players).includes(userId) || !(lives[userId] > 0)) throw badRequest("You're not playing in this game.");
      return { game: penalize(game, userId, "forfeit", { all: true }), channel };
    },

    /** Costs a life to every player whose turn ran out. Returns the changed games so they can be broadcast. */
    expireTurns(at = now()) {
      const due = db.all(
        "SELECT * FROM word_chain_games WHERE status = 'playing' AND turn_deadline IS NOT NULL AND turn_deadline + ? < ?",
        GRACE_MS,
        at,
      );
      return due.map((game) => {
        const userId = JSON.parse(game.players)[game.turn];
        return { game: penalize(game, userId, "timeout", { at }), channel: channels.byId(game.channel_id) };
      });
    },

    finish(gameId, userId) {
      const { game, channel, membership } = visible(gameId, userId);
      assertManager(game, userId, membership);
      if (game.status !== "playing") throw badRequest("Only a running game can be finished.");
      // Ended early: whoever has the most lives left wins, unless it's a tie.
      const lives = JSON.parse(game.lives);
      const left = alive(JSON.parse(game.players), lives).sort((a, b) => lives[b] - lives[a]);
      const winner = left.length && (left.length === 1 || lives[left[0]] > lives[left[1]]) ? left[0] : null;
      return { game: save(gameId, { status: "finished", winner_id: winner, turn_deadline: null }), channel };
    },

    cancel(gameId, userId) {
      const { game, channel, membership } = visible(gameId, userId);
      assertManager(game, userId, membership);
      if (game.status !== "lobby") throw badRequest("Only a lobby can be cancelled.");
      return { game: save(gameId, { status: "cancelled" }), channel };
    },
  };
  return service;
}
