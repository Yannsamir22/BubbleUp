import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { openDatabase } from "./db/index.js";
import { requireAuth } from "./lib/auth.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { createUserService } from "./services/users.js";
import { createClassService } from "./services/classes.js";
import { createChannelService } from "./services/channels.js";
import { createMessageService } from "./services/messages.js";
import { createUploadService } from "./services/uploads.js";
import { createBot } from "./bot/index.js";
import { createChessService } from "./services/chess.js";
import { createImposterService } from "./services/imposter.js";
import { createEmojiService } from "./services/emojis.js";
import { createAwardsService, isoWeek } from "./services/awards.js";
import { createCalendarService } from "./services/calendar.js";
import { createWordChainService } from "./services/wordChain.js";
import { createRealtime } from "./realtime/index.js";
import { authRoutes } from "./routes/auth.routes.js";
import { classRoutes } from "./routes/classes.routes.js";
import { messageRoutes } from "./routes/messages.routes.js";
import { funRoutes } from "./routes/fun.routes.js";

/**
 * Builds the whole server (DB, services, HTTP, Socket.IO) without listening,
 * so tests can spin up isolated instances.
 */
export function createServer(config, { logger = console, fetchImpl } = {}) {
  const db = openDatabase(config.dbFile);

  const users = createUserService(db);
  const classes = createClassService(db);
  const channels = createChannelService(db, classes);
  const messages = createMessageService(db, { channels, classes });
  const uploads = createUploadService(db, config, { channels });
  const chess = createChessService(db, { channels, classes, messages });
  messages.extend("chess", chess);
  const imposter = createImposterService(db, { channels, classes, messages });
  messages.extend("imposter", imposter);
  const wordChain = createWordChainService(db, { channels, messages });
  messages.extend("wordChain", wordChain);
  const emojis = createEmojiService(db, config, { classes });
  const awards = createAwardsService(db);
  const calendar = createCalendarService(db, { classes });
  const services = { users, classes, channels, messages, uploads, chess, imposter, wordChain, emojis, awards, calendar };
  const bot = createBot(db, config, { fetchImpl, awards });

  const app = express();
  const server =
    config.httpsKey && config.httpsCert
      ? https.createServer({ key: fs.readFileSync(config.httpsKey), cert: fs.readFileSync(config.httpsCert) }, app)
      : http.createServer(app);
  const rt = createRealtime(server, { db, config, channels, imposter, logger });

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "media-src": ["'self'", "blob:"],
          "connect-src": ["'self'", "ws:", "wss:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "font-src": ["'self'", "data:"],
          "frame-src": ["'self'"],
          "upgrade-insecure-requests": null, // classroom LAN setups often run on plain http
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.cookieSecure === true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "200kb" }));

  // ---- API ----
  const api = express.Router();
  const ctx = { db, config, services, rt, bot, logger };
  api.get("/health", (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));
  api.use(authRoutes(ctx));
  api.use(requireAuth(db, config));
  api.use(classRoutes(ctx));
  api.use(messageRoutes(ctx));
  api.use(funRoutes(ctx));
  api.use((req, res, next) => next(notFound("No such API endpoint.")));
  app.use("/api", api);

  // ---- Frontend (production build) ----
  if (fs.existsSync(path.join(config.clientDist, "index.html"))) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders(res, file) {
          const hashed = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    app.get("/{*path}", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(config.clientDist, "index.html"));
    });
  } else {
    app.get("/", (req, res) =>
      res.type("text").send("BubbleUp API is running. Build the client (npm run build) or use the Vite dev server (npm run dev)."),
    );
  }

  app.use(errorHandler(logger));

  /**
   * Weekly awards: on the configured day/hour (default Friday 15:00 server time),
   * Thinkmas posts the week's awards in each class's #general, once per week.
   */
  function postWeeklyAwards(at = new Date()) {
    if (at.getDay() !== config.awardsDay || at.getHours() < config.awardsHour) return 0;
    const week = isoWeek(at.getTime());
    let posted = 0;
    for (const { id: classId } of db.all("SELECT id FROM classes")) {
      if (awards.alreadyPosted(classId, week)) continue;
      awards.markPosted(classId, week);
      const winners = awards.compute(classId, at.getTime());
      const general = channels.general(classId);
      if (!winners.length || !general) continue;
      const msgId = messages.createBotMessage(general.id, awards.format(winners));
      rt.toClass(classId, "message:new", { message: messages.get(msgId, 0) });
      posted++;
    }
    return posted;
  }
  const awardsTimer = config.awardsEnabled ? setInterval(() => {
    try {
      postWeeklyAwards();
    } catch (err) {
      logger.error("[awards]", err);
    }
  }, 10 * 60 * 1000) : null;
  awardsTimer?.unref();

  /** Countdowns stay pinned through their day, then unpin themselves. */
  function unpinFinishedCountdowns(today) {
    const done = messages.unpinFinishedCountdowns(today);
    for (const { id, channel } of done) rt.toChannel(channel, "message:updated", { message: messages.get(id, 0) });
    return done.length;
  }
  const countdownTimer = setInterval(() => {
    try {
      unpinFinishedCountdowns();
    } catch (err) {
      logger.error("[countdowns]", err);
    }
  }, 10 * 60 * 1000);
  countdownTimer.unref();
  setImmediate(() => {
    try {
      unpinFinishedCountdowns();
    } catch (err) {
      logger.error("[countdowns]", err);
    }
  });

  /** Sends one class-wide reminder 24 hours before each event. */
  function dispatchCalendarReminders(at = Date.now()) {
    const due = calendar.dispatchReminders(at);
    for (const event of due) rt.toClass(event.classId, "calendar:reminder", { event });
    return due.length;
  }
  const calendarTimer = setInterval(() => {
    try {
      dispatchCalendarReminders();
    } catch (err) {
      logger.error("[calendar]", err);
    }
  }, 60 * 1000);
  calendarTimer.unref();
  setImmediate(() => {
    try {
      dispatchCalendarReminders();
    } catch (err) {
      logger.error("[calendar]", err);
    }
  });

  /** Word Chain: a player whose turn timer ran out loses a life and the turn moves on. */
  function expireWordChainTurns(at = Date.now()) {
    const expired = wordChain.expireTurns(at);
    for (const { game, channel } of expired) rt.toChannel(channel, "word-chain:update", { game: wordChain.dto(game) });
    return expired.length;
  }
  const wordChainTimer = setInterval(() => {
    try {
      expireWordChainTurns();
    } catch (err) {
      logger.error("[word-chain]", err);
    }
  }, 1000);
  wordChainTimer.unref();

  // Hourly housekeeping: forget uploads that were never sent.
  const cleanup = setInterval(() => {
    try {
      const n = uploads.cleanupOrphans();
      if (n) logger.info(`[cleanup] removed ${n} unsent upload(s)`);
    } catch (err) {
      logger.error("[cleanup]", err);
    }
  }, 60 * 60 * 1000);
  cleanup.unref();

  async function close() {
    clearInterval(cleanup);
    clearInterval(countdownTimer);
    clearInterval(calendarTimer);
    clearInterval(wordChainTimer);
    if (awardsTimer) clearInterval(awardsTimer);
    await rt.close();
    if (server.listening) await new Promise((ok) => server.close(() => ok()));
    db.close();
  }

  return { app, server, db, services, rt, bot, close, postWeeklyAwards, unpinFinishedCountdowns, dispatchCalendarReminders, expireWordChainTurns };
}
