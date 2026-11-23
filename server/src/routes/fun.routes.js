import { Router } from "express";
import { badRequest } from "../lib/errors.js";

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Invalid id.");
  return n;
};

/** Class games and emoji. */
export function funRoutes({ services, rt }) {
  const { chess, imposter, wordChain, emojis, classes, messages } = services;
  const r = Router();

  // ---------- chess ----------
  const pushGame = ({ game, channel }) => rt.toChannel(channel, "chess:update", { game });

  r.post("/channels/:channelId/chess", (req, res) => {
    const opponentId = id(req.body?.opponentId);
    const { messageId, channel } = chess.challenge(id(req.params.channelId), req.user.id, opponentId);
    const message = messages.get(messageId, req.user.id);
    rt.toChannel(channel, "message:new", { message, clientId: req.body?.clientId });
    res.status(201).json({ message });
  });

  r.get("/chess/:gameId", (req, res) => {
    res.json({ game: chess.get(id(req.params.gameId), req.user.id) });
  });

  const action = (name, fn) =>
    r.post(`/chess/:gameId/${name}`, (req, res) => {
      const out = fn(id(req.params.gameId), req.user.id, req.body ?? {});
      pushGame(out);
      res.json({ game: out.game });
    });
  action("accept", (g, u) => chess.respond(g, u, true));
  action("decline", (g, u) => chess.respond(g, u, false));
  action("cancel", (g, u) => chess.cancel(g, u));
  action("move", (g, u, body) => chess.move(g, u, body));
  action("resign", (g, u) => chess.resign(g, u));

  // ---------- word chain ----------
  const pushWordChain = ({ game, channel }) => rt.toChannel(channel, "word-chain:update", { game: wordChain.dto(game) });

  r.post("/channels/:channelId/word-chain", (req, res) => {
    const { clientId, ...options } = req.body ?? {};
    const { messageId, channel } = wordChain.create(id(req.params.channelId), req.user.id, options);
    const message = messages.get(messageId, req.user.id);
    rt.toChannel(channel, "message:new", { message, clientId });
    res.status(201).json({ message });
  });

  r.get("/word-chain/:gameId", (req, res) => {
    res.json({ game: wordChain.get(id(req.params.gameId), req.user.id) });
  });

  const wordChainAction = (name, fn) =>
    r.post(`/word-chain/:gameId/${name}`, (req, res) => {
      const out = fn(id(req.params.gameId), req.user.id, req.body ?? {});
      pushWordChain(out);
      res.json({ game: wordChain.dto(out.game), penalty: out.penalty ?? null });
    });
  wordChainAction("join", (g, u) => wordChain.join(g, u));
  wordChainAction("leave", (g, u) => wordChain.leave(g, u));
  wordChainAction("start", (g, u) => wordChain.start(g, u));
  wordChainAction("play", (g, u, body) => wordChain.play(g, u, body));
  wordChainAction("forfeit", (g, u) => wordChain.forfeit(g, u));
  wordChainAction("finish", (g, u) => wordChain.finish(g, u));
  wordChainAction("cancel", (g, u) => wordChain.cancel(g, u));

  // ---------- imposter ----------
  // Broadcasts carry only the public view; each participant's secret (role + word) goes to them alone.
  const pushImposter = ({ g, channel, started }) => {
    rt.toChannel(channel, "imposter:update", { game: imposter.publicDto(g) });
    if (started) for (const userId of imposter.participants(g)) rt.toUser(userId, "imposter:secret", { gameId: g.id, version: g.version, me: imposter.me(g, userId) });
  };

  r.get("/imposter/categories", (req, res) => {
    res.json({ categories: imposter.categories });
  });

  r.post("/channels/:channelId/imposter", (req, res) => {
    const { messageId, channel } = imposter.create(id(req.params.channelId), req.user.id, req.body ?? {});
    const message = messages.get(messageId, req.user.id);
    rt.toChannel(channel, "message:new", { message, clientId: req.body?.clientId });
    res.status(201).json({ message });
  });

  r.get("/imposter/:gameId", (req, res) => {
    res.json({ game: imposter.view(id(req.params.gameId), req.user.id) });
  });

  const imposterAction = (name, fn) =>
    r.post(`/imposter/:gameId/${name}`, (req, res) => {
      const out = fn(id(req.params.gameId), req.user.id, req.body ?? {});
      pushImposter(out);
      res.json({ game: imposter.dto(out.g, req.user.id) });
    });
  imposterAction("join", (g, u) => imposter.join(g, u));
  imposterAction("leave", (g, u) => imposter.leave(g, u));
  imposterAction("start", (g, u) => imposter.start(g, u));
  imposterAction("clue", (g, u, body) => imposter.clue(g, u, body));
  imposterAction("vote", (g, u, body) => imposter.vote(g, u, body));
  imposterAction("guess", (g, u, body) => imposter.guess(g, u, body));
  imposterAction("advance", (g, u) => imposter.advance(g, u));
  imposterAction("cancel", (g, u) => imposter.cancel(g, u));

  // ---------- class emoji ----------
  const pushEmojis = (classId) => rt.toClass(classId, "emojis:updated", { classId, emojis: emojis.list(classId) });

  r.get("/classes/:classId/emojis", (req, res) => {
    const classId = id(req.params.classId);
    classes.requireMember(classId, req.user.id);
    res.json({ emojis: emojis.list(classId) });
  });

  r.post(
    "/classes/:classId/emojis",
    (req, res, next) => {
      classes.requireMember(id(req.params.classId), req.user.id);
      next();
    },
    emojis.middleware,
    (req, res) => {
      const classId = id(req.params.classId);
      const emoji = emojis.add(classId, req.user.id, req.file, req.body?.name);
      pushEmojis(classId);
      res.status(201).json({ emoji });
    },
  );

  r.delete("/classes/:classId/emojis/:name", (req, res) => {
    const classId = id(req.params.classId);
    emojis.remove(classId, req.user.id, req.params.name);
    pushEmojis(classId);
    res.status(204).end();
  });

  r.get("/emoji/:emojiId", (req, res, next) => {
    const file = emojis.resolve(id(req.params.emojiId), req.user.id);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(file.mime);
    res.sendFile(file.path, (err) => err && !res.headersSent && next(err));
  });

  return r;
}
