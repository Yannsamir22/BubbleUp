import crypto from "node:crypto";
import { Chess } from "chess.js";
import { z } from "zod";
import { badRequest, forbidden, notFound, parse } from "../lib/errors.js";
import { now } from "../lib/util.js";
import { publicUser } from "./users.js";

const moveSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

/** Rebuilds the position from the move list (keeps repetition/50-move history intact). */
export function replay(moves) {
  const game = new Chess();
  for (const san of moves) game.move(san);
  return game;
}

function outcome(game, moverColor) {
  if (game.isCheckmate()) return { result: moverColor === "w" ? "white" : "black", reason: "checkmate" };
  if (game.isStalemate()) return { result: "draw", reason: "stalemate" };
  if (game.isThreefoldRepetition()) return { result: "draw", reason: "repetition" };
  if (game.isInsufficientMaterial()) return { result: "draw", reason: "insufficient" };
  if (game.isDrawByFiftyMoves()) return { result: "draw", reason: "fifty" };
  return null;
}

/**
 * Chess games between two members of a class. The server is the referee:
 * every move is validated with chess.js before it is saved.
 */
export function createChessService(db, { channels, classes, messages }) {
  const userById = (id) => publicUser(db.get("SELECT * FROM users WHERE id = ?", id));

  function row(gameId) {
    const g = db.get("SELECT * FROM chess_games WHERE id = ?", gameId);
    if (!g) throw notFound("Game not found.");
    return g;
  }

  /** Loads a game the user is allowed to see (same rules as its channel). */
  function visible(gameId, userId) {
    const g = row(gameId);
    const { channel } = channels.access(g.channel_id, userId);
    return { g, channel };
  }

  const service = {
    dto(g) {
      const moves = JSON.parse(g.moves);
      const game = replay(moves);
      const verbose = game.history({ verbose: true });
      const last = verbose.at(-1);
      return {
        id: g.id,
        channelId: g.channel_id,
        messageId: g.message_id,
        challengerId: g.challenger_id,
        opponentId: g.opponent_id,
        white: userById(g.white_id),
        black: userById(g.black_id),
        status: g.status,
        fen: game.fen(),
        moves,
        lastMove: last ? { from: last.from, to: last.to } : null,
        turn: game.turn() === "w" ? "white" : "black",
        check: game.inCheck(),
        result: g.result,
        reason: g.reason,
        updatedAt: g.updated_at,
      };
    },

    /** DTOs for games attached to these message ids (used when hydrating messages). */
    forMessages(messageIds) {
      if (!messageIds.length) return new Map();
      const rows = db.all("SELECT * FROM chess_games WHERE message_id IN (SELECT value FROM json_each(?))", JSON.stringify(messageIds));
      return new Map(rows.map((g) => [g.message_id, this.dto(g)]));
    },

    get(gameId, userId) {
      return this.dto(visible(gameId, userId).g);
    },

    /** Posts a challenge card in the channel. Colours are assigned randomly. */
    challenge(channelId, userId, opponentId) {
      const { channel, membership } = channels.access(channelId, userId);
      channels.assertCanPost(channel, membership);
      if (opponentId === userId) throw badRequest("You can't play against yourself here. Challenge a classmate!");
      if (!classes.membership(channel.class_id, opponentId)) throw notFound("That person isn't in this class.");
      if (channel.kind === "dm" && !channels.dmMemberIds(channel.id).includes(opponentId)) {
        throw badRequest("In a private chat you can only challenge the other person.");
      }
      const opponent = db.get("SELECT username FROM users WHERE id = ?", opponentId);
      const [whiteId, blackId] = crypto.randomInt(2) ? [userId, opponentId] : [opponentId, userId];

      return db.tx(() => {
        const t = now();
        const { lastInsertRowid } = db.run(
          `INSERT INTO chess_games (class_id, channel_id, challenger_id, opponent_id, white_id, black_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          channel.class_id, channelId, userId, opponentId, whiteId, blackId, t, t,
        );
        const gameId = Number(lastInsertRowid);
        const messageId = messages.createWithMeta(channelId, userId, `♟ @${opponent.username}, want to play chess?`, { type: "chess", gameId });
        db.run("UPDATE chess_games SET message_id = ? WHERE id = ?", messageId, gameId);
        return { gameId, messageId, channel };
      });
    },

    respond(gameId, userId, accept) {
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "pending") throw badRequest("This challenge was already answered.");
      if (g.opponent_id !== userId) throw forbidden("Only the challenged player can answer.");
      db.run("UPDATE chess_games SET status = ?, updated_at = ? WHERE id = ?", accept ? "active" : "declined", now(), gameId);
      return { game: this.dto(row(gameId)), channel };
    },

    cancel(gameId, userId) {
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "pending") throw badRequest("Only a waiting challenge can be cancelled.");
      if (g.challenger_id !== userId) throw forbidden("Only the person who sent the challenge can cancel it.");
      db.run("UPDATE chess_games SET status = 'cancelled', updated_at = ? WHERE id = ?", now(), gameId);
      return { game: this.dto(row(gameId)), channel };
    },

    move(gameId, userId, input) {
      const m = parse(moveSchema, input);
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "active") throw badRequest("This game isn't being played right now.");
      const moves = JSON.parse(g.moves);
      const game = replay(moves);
      const myColor = g.white_id === userId ? "w" : g.black_id === userId ? "b" : null;
      if (!myColor) throw forbidden("You're watching this game, not playing it.");
      if (game.turn() !== myColor) throw badRequest("It's not your turn.");

      let played;
      try {
        played = game.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
      } catch {
        throw badRequest("That move isn't allowed.");
      }
      moves.push(played.san);
      const end = outcome(game, myColor);
      db.run(
        "UPDATE chess_games SET moves = ?, status = ?, result = ?, reason = ?, updated_at = ? WHERE id = ?",
        JSON.stringify(moves), end ? "finished" : "active", end?.result ?? null, end?.reason ?? null, now(), gameId,
      );
      return { game: this.dto(row(gameId)), channel };
    },

    resign(gameId, userId) {
      const { g, channel } = visible(gameId, userId);
      if (g.status !== "active") throw badRequest("This game isn't being played right now.");
      if (g.white_id !== userId && g.black_id !== userId) throw forbidden("Only players can resign.");
      const winner = g.white_id === userId ? "black" : "white";
      db.run("UPDATE chess_games SET status = 'finished', result = ?, reason = 'resign', updated_at = ? WHERE id = ?", winner, now(), gameId);
      return { game: this.dto(row(gameId)), channel };
    },
  };
  return service;
}
