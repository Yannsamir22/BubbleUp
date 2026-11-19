import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { badRequest, notFound } from "../lib/errors.js";
import { countdownBody } from "../lib/countdown.js";
import { isStaff } from "../services/classes.js";
import { BOT } from "../bot/persona.js";

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Invalid id.");
  return n;
};

/** Per-viewer fields (my poll votes) must not leak into broadcasts. */
function forBroadcast(message) {
  if (!message?.poll) return message;
  const poll = { ...message.poll };
  delete poll.myVotes;
  return { ...message, poll };
}

export function messageRoutes({ db, config, services, rt, bot, logger = console }) {
  const { channels, messages, uploads, chess, imposter } = services;
  const r = Router();

  const sendLimiter = config.rateLimit
    ? rateLimit({
        windowMs: 10_000,
        limit: 25,
        keyGenerator: (req) => `u${req.user.id}`,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "You're sending messages too fast. Wait a few seconds.", code: "rate_limited" },
      })
    : (req, res, next) => next();

  function broadcastUpdate(channel, messageId) {
    rt.toChannel(channel, "message:updated", { message: forBroadcast(messages.get(messageId, 0)) });
  }

  // ---------- channels ----------
  r.patch("/channels/:channelId", (req, res) => {
    const channel = channels.update(id(req.params.channelId), req.user.id, req.body ?? {});
    const dto = channels.dto(channel);
    rt.toClass(channel.class_id, "channel:updated", { channel: dto });
    res.json({ channel: dto });
  });

  r.delete("/channels/:channelId", (req, res) => {
    const channel = channels.remove(id(req.params.channelId), req.user.id);
    rt.toClass(channel.class_id, "channel:removed", { classId: channel.class_id, channelId: channel.id });
    res.status(204).end();
  });

  r.get("/channels/:channelId/messages", (req, res) => {
    const opt = (k) => (req.query[k] ? id(req.query[k]) : undefined);
    res.json(
      messages.list(id(req.params.channelId), req.user.id, {
        before: opt("before"),
        after: opt("after"),
        around: opt("around"),
        limit: req.query.limit,
      }),
    );
  });

  r.get("/channels/:channelId/pins", (req, res) => {
    res.json({ messages: messages.pins(id(req.params.channelId), req.user.id) });
  });

  r.get("/channels/:channelId/reads", (req, res) => {
    const channelId = id(req.params.channelId);
    channels.access(channelId, req.user.id);
    res.json({ reads: channels.readStates(channelId) });
  });

  r.post("/channels/:channelId/read", (req, res) => {
    const channelId = id(req.params.channelId);
    const { channel } = channels.access(channelId, req.user.id);
    const messageId = req.body?.messageId ? id(req.body.messageId) : undefined;
    const lastReadId = channels.markRead(channelId, req.user.id, messageId);
    const payload = { channelId, userId: req.user.id, lastReadId };
    // DMs show "seen" receipts, so the other person learns about it; otherwise only my other tabs.
    if (channel.kind === "dm") rt.toChannel(channel, "read", payload);
    else rt.toUser(req.user.id, "read", payload);
    res.json({ lastReadId });
  });

  r.post("/channels/:channelId/messages", sendLimiter, (req, res) => {
    const channelId = id(req.params.channelId);
    const { channel, membership } = channels.access(channelId, req.user.id);
    const input = { ...(req.body ?? {}) };
    const body = typeof input.body === "string" ? input.body.trim() : "";
    let botReply = null;

    if (body.startsWith("//")) {
      input.body = body.slice(1); // "//path" escapes a slash command
    } else if (body.startsWith("/")) {
      const cmd = bot.handle(body, {
        classId: channel.class_id,
        userId: req.user.id,
        isStaff: isStaff(membership.role),
        isOnline: rt.isOnline,
      });
      if (cmd?.type === "ephemeral") {
        return res.json({ ephemeral: { body: cmd.text, author: BOT, createdAt: Date.now() } });
      }
      if (cmd?.type === "chess") {
        const opponent = db.get("SELECT id FROM users WHERE username = ?", cmd.username);
        if (!opponent) return res.json({ ephemeral: { body: `Nobody called @${cmd.username} in this class.`, author: BOT, createdAt: Date.now() } });
        const { messageId } = chess.challenge(channelId, req.user.id, opponent.id);
        const message = messages.get(messageId, req.user.id);
        rt.toChannel(channel, "message:new", { message: forBroadcast(message), clientId: input.clientId });
        return res.status(201).json({ message });
      }
      if (cmd?.type === "countdown") {
        channels.assertCanPost(channel, membership);
        const messageId = messages.createWithMeta(channelId, req.user.id, countdownBody(cmd.countdown), { type: "countdown", ...cmd.countdown });
        // Same rule as pinning by hand: teachers in class channels, anyone in a private chat.
        if (channel.kind === "dm" || isStaff(membership.role)) messages.setPinned(messageId, req.user.id, true);
        const message = messages.get(messageId, req.user.id);
        rt.toChannel(channel, "message:new", { message: forBroadcast(message), clientId: input.clientId });
        return res.status(201).json({ message });
      }
      if (cmd?.type === "imposter") {
        let messageId;
        try {
          ({ messageId } = imposter.create(channelId, req.user.id, { mode: "random", category: cmd.category }));
        } catch (err) {
          if (err.status !== 400) throw err;
          return res.json({ ephemeral: { body: err.message, author: BOT, createdAt: Date.now() } });
        }
        const message = messages.get(messageId, req.user.id);
        rt.toChannel(channel, "message:new", { message: forBroadcast(message), clientId: input.clientId });
        return res.status(201).json({ message });
      }
      if (cmd?.type === "transform") input.body = cmd.body;
      if (cmd?.type === "poll") Object.assign(input, { body: "", poll: cmd.poll });
      if (cmd?.type === "public") botReply = cmd.reply;
    } else {
      const question = bot.mention(body);
      if (question !== null) botReply = Promise.resolve(bot.ask(channel.class_id, question));
    }

    const messageId = messages.create(channelId, req.user.id, input);
    const message = messages.get(messageId, req.user.id);
    rt.toChannel(channel, "message:new", { message: forBroadcast(message), clientId: input.clientId });
    res.status(201).json({ message });

    if (botReply) {
      rt.toChannel(channel, "typing", { channelId, userId: BOT.id });
      Promise.all([botReply, new Promise((ok) => setTimeout(ok, config.isTest ? 0 : 450))])
        .then(([reply]) => {
          const { body: text, meta } = typeof reply === "string" ? { body: reply, meta: null } : reply;
          const botId = messages.createBotMessage(channelId, text, { replyToId: messageId, meta });
          rt.toChannel(channel, "message:new", { message: messages.get(botId, 0) });
        })
        .catch((err) => logger.error("[bot] reply failed:", err));
    }
  });

  // ---------- messages ----------
  r.patch("/messages/:messageId", (req, res) => {
    const messageId = id(req.params.messageId);
    const { channel } = messages.edit(messageId, req.user.id, req.body ?? {});
    broadcastUpdate(channel, messageId);
    res.json({ message: messages.get(messageId, req.user.id) });
  });

  r.delete("/messages/:messageId", (req, res) => {
    const messageId = id(req.params.messageId);
    const { channel } = messages.remove(messageId, req.user.id);
    uploads.purgeMessage(messageId);
    broadcastUpdate(channel, messageId);
    res.status(204).end();
  });

  r.post("/messages/:messageId/reactions", (req, res) => {
    const messageId = id(req.params.messageId);
    const { channel, reactions } = messages.toggleReaction(messageId, req.user.id, req.body ?? {});
    rt.toChannel(channel, "message:reactions", { messageId, channelId: channel.id, reactions });
    res.json({ reactions });
  });

  for (const [method, pinned] of [["put", true], ["delete", false]]) {
    r[method]("/messages/:messageId/pin", (req, res) => {
      const messageId = id(req.params.messageId);
      const { channel } = messages.setPinned(messageId, req.user.id, pinned);
      broadcastUpdate(channel, messageId);
      res.json({ message: messages.get(messageId, req.user.id) });
    });
  }

  r.post("/messages/:messageId/vote", (req, res) => {
    const messageId = id(req.params.messageId);
    const { channel } = messages.vote(messageId, req.user.id, req.body ?? {});
    broadcastUpdate(channel, messageId);
    res.json({ message: messages.get(messageId, req.user.id) });
  });

  r.post("/messages/:messageId/close-poll", (req, res) => {
    const messageId = id(req.params.messageId);
    const { channel } = messages.closePoll(messageId, req.user.id);
    broadcastUpdate(channel, messageId);
    res.json({ message: messages.get(messageId, req.user.id) });
  });

  // ---------- files ----------
  r.get("/files/:publicId{/:name}", (req, res, next) => {
    const file = uploads.resolve(req.params.publicId, req.user.id);
    const download = req.query.download !== undefined || !file.inline;
    res.attachment(file.name); // sets Content-Disposition (and a guessed type, overridden below)
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", file.inline ? file.mime : "application/octet-stream");
    if (!file.mime.startsWith("application/pdf")) {
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    if (!download) res.setHeader("Content-Disposition", res.getHeader("Content-Disposition").replace(/^attachment/, "inline"));
    res.sendFile(file.path, { headers: {} }, (err) => {
      if (err && !res.headersSent) next(err.status === 404 ? notFound("This file is no longer available.") : err);
    });
  });

  return r;
}
