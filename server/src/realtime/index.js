import { Server } from "socket.io";
import { COOKIE_NAME, readCookie, userFromToken } from "../lib/auth.js";

const userRoom = (id) => `user:${id}`;
const classRoom = (id) => `class:${id}`;
const imposterRoom = (id) => `imposter:${id}`;
const MAX_WATCHED = 5;

/**
 * Socket.IO is used for *push* only (new messages, presence, typing).
 * All writes go through the REST API, which then calls the emit helpers below.
 */
export function createRealtime(httpServer, { db, config, channels, imposter }) {
  const io = new Server(httpServer, {
    cors: config.corsOrigin ? { origin: config.corsOrigin.split(","), credentials: true } : undefined,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  /** userId -> number of open sockets (a user can have several tabs/devices). */
  const online = new Map();

  io.use((socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, COOKIE_NAME);
    const user = userFromToken(db, config, token);
    if (!user) return next(new Error("unauthorized"));
    socket.data.userId = user.id;
    next();
  });

  function classIdsOf(userId) {
    return db.all("SELECT class_id FROM memberships WHERE user_id = ?", userId).map((r) => r.class_id);
  }

  function emitPresence(userId, isOnline) {
    const rooms = classIdsOf(userId).map(classRoom);
    if (rooms.length) io.to(rooms).emit("presence", { userId, online: isOnline });
  }

  /** Tells everyone with an Imposter game open who else is looking at it (distinct users, not tabs). */
  async function emitWatchers(gameId) {
    const sockets = await io.in(imposterRoom(gameId)).fetchSockets();
    const userIds = [...new Set(sockets.map((x) => x.data.userId))];
    io.to(imposterRoom(gameId)).emit("imposter:watchers", { gameId, userIds });
  }

  io.on("connection", (socket) => {
    const { userId } = socket.data;
    socket.join([userRoom(userId), ...classIdsOf(userId).map(classRoom)]);

    const count = (online.get(userId) ?? 0) + 1;
    online.set(userId, count);
    if (count === 1) emitPresence(userId, true);

    let lastTyping = 0;
    socket.on("typing", (payload) => {
      const channelId = Number(payload?.channelId);
      const t = Date.now();
      if (!channelId || t - lastTyping < 1500) return; // server-side throttle
      lastTyping = t;
      try {
        const { channel } = channels.access(channelId, userId);
        api.toChannel(channel, "typing", { channelId, userId }, { exceptUser: userId });
      } catch {
        /* no access: ignore silently */
      }
    });

    // Opening an Imposter game joins its watch room. The reply carries this viewer's snapshot,
    // so a move made between loading and joining can't be missed. Access = the game's channel.
    socket.on("imposter:watch", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const gameId = Number(payload?.gameId);
      try {
        if (!imposter || !Number.isInteger(gameId) || gameId <= 0) throw new Error("Game not found.");
        const watching = [...socket.rooms].filter((r) => r.startsWith("imposter:"));
        if (watching.length >= MAX_WATCHED && !socket.rooms.has(imposterRoom(gameId))) throw new Error("Close another game first.");
        const game = imposter.view(gameId, userId);
        socket.join(imposterRoom(gameId));
        emitWatchers(gameId).catch(() => {});
        reply({ ok: true, game });
      } catch (err) {
        reply({ ok: false, error: err.message });
      }
    });

    socket.on("imposter:unwatch", (payload) => {
      const gameId = Number(payload?.gameId);
      if (!socket.rooms.has(imposterRoom(gameId))) return;
      socket.leave(imposterRoom(gameId));
      emitWatchers(gameId).catch(() => {});
    });

    socket.on("disconnecting", () => {
      const ids = [...socket.rooms].filter((r) => r.startsWith("imposter:")).map((r) => Number(r.slice(9)));
      if (ids.length) setImmediate(() => ids.forEach((gameId) => emitWatchers(gameId).catch(() => {})));
    });

    socket.on("disconnect", () => {
      const left = (online.get(userId) ?? 1) - 1;
      if (left <= 0) {
        online.delete(userId);
        emitPresence(userId, false);
      } else {
        online.set(userId, left);
      }
    });
  });

  const api = {
    io,
    isOnline: (userId) => online.has(userId),
    toUser(userId, event, data) {
      io.to(userRoom(userId)).emit(event, data);
    },
    toClass(classId, event, data) {
      io.to(classRoom(classId)).emit(event, data);
    },
    /** DMs go to the two participants; everything else to the whole class. */
    toChannel(channel, event, data, { exceptUser } = {}) {
      const rooms = channel.kind === "dm" ? channels.dmMemberIds(channel.id).map(userRoom) : [classRoom(channel.class_id)];
      let target = io.to(rooms);
      if (exceptUser) target = target.except(userRoom(exceptUser));
      target.emit(event, data);
    },
    joinClass(userId, classId) {
      io.in(userRoom(userId)).socketsJoin(classRoom(classId));
    },
    leaveClass(userId, classId) {
      io.in(userRoom(userId)).socketsLeave(classRoom(classId));
      // Also stop them watching any Imposter game (they would no longer pass the access check).
      io.in(userRoom(userId))
        .fetchSockets()
        .then((list) => list.forEach((x) => [...x.rooms].filter((r) => r.startsWith("imposter:")).forEach((r) => x.leave(r))))
        .catch(() => {});
    },
    disconnectUser(userId) {
      io.in(userRoom(userId)).disconnectSockets(true);
    },
    close() {
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
  return api;
}
