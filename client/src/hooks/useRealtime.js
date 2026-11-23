import { useEffect } from "react";
import { io } from "socket.io-client";
import { useStore } from "../store/index.js";
import { playPop, showNotification } from "../lib/browser.js";
import { mentions } from "../lib/markdown.jsx";
import { chatPath, navigate } from "../lib/router.js";

let socket = null;
export const getSocket = () => socket;

/** Connects Socket.IO while logged in and routes server events into the store. */
export function useRealtime() {
  const meId = useStore((s) => s.me?.id);

  useEffect(() => {
    if (!meId) return;
    const st = useStore.getState;
    socket = io({ withCredentials: true, transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      useStore.setState({ connection: "connected" });
      if (!socket.recovered) resync();
    });
    socket.on("disconnect", () => useStore.setState({ connection: "connecting" }));
    socket.on("connect_error", (err) => {
      useStore.setState({ connection: "offline" });
      if (err.message === "unauthorized") st().logout();
    });

    socket.on("message:new", (evt) => {
      const { isNew, channel } = st().onMessageNew(evt) ?? {};
      if (isNew) alertFor(evt.message, channel);
    });
    socket.on("message:updated", (e) => st().onMessageUpdated(e));
    socket.on("message:reactions", (e) => st().onReactions(e));
    socket.on("typing", (e) => st().onTyping(e));
    socket.on("presence", (e) => st().onPresence(e));
    socket.on("read", (e) => st().onRead(e));
    socket.on("channel:created", (e) => st().onChannelCreated(e));
    socket.on("channel:updated", (e) => st().onChannelUpdated(e));
    socket.on("channel:removed", (e) => {
      st().onChannelRemoved(e);
      if (st().activeChannelId === e.channelId) {
        st().toast("This channel was deleted by a teacher");
        navigate(chatPath(e.classId), { replace: true });
      }
    });
    socket.on("member:updated", (e) => st().onMemberUpdated(e));
    socket.on("member:removed", (e) => st().onMemberRemoved(e));
    socket.on("user:updated", (e) => st().onUserUpdated(e));
    socket.on("chess:update", (e) => {
      st().onChessUpdate(e);
      const g = e.game;
      const me = st().me?.id;
      // Tell a player when it becomes their turn while they're looking elsewhere.
      if (g.status === "active" && g[g.turn]?.id === me && g.moves.length && st().modal?.props?.gameId !== g.id) {
        st().toast(`Your move in chess against ${(g.white.id === me ? g.black : g.white).displayName}`);
      }
    });
    socket.on("imposter:update", (e) => {
      const before = st().imposter[e.game.id];
      st().onImposterUpdate(e);
      const g = e.game;
      const me = st().me?.id;
      const looking = st().modal?.type === "imposter" && st().modal?.props?.gameId === g.id;
      if (looking || !g.players.some((p) => p.id === me)) return;
      // Nudge players who are looking elsewhere.
      if (g.status === "clues" && g.turnUserId === me && before?.turnUserId !== me) st().toast("Your turn to give a clue in Imposter");
      else if (g.status === "voting" && before?.status !== "voting") st().toast("Imposter: time to vote!");
    });
    socket.on("imposter:secret", (e) => st().onImposterSecret(e));
    socket.on("imposter:watchers", (e) => st().onImposterWatchers(e));
    socket.on("word-chain:update", ({ game }) => {
      const before = st().wordChains[game.id];
      st().onWordChainUpdate({ game });
      const me = st().me?.id;
      const looking = st().modal?.type === "wordChain" && st().modal?.props?.gameId === game.id;
      if (!looking && game.status === "playing" && game.turnUserId === me && before?.turnUserId !== me) {
        st().toast("Your turn in Word Chain");
      }
    });
    socket.on("calendar:updated", (e) => st().onCalendarUpdated(e));
    socket.on("calendar:reminder", ({ event }) => {
      const message = `${event.title} starts ${new Date(event.startsAt).toLocaleString()}`;
      if (document.visibilityState === "visible" && document.hasFocus()) st().toast(`Calendar reminder: ${message}`);
      else showNotification("Upcoming class event", message);
    });
    socket.on("emojis:updated", (e) => st().onEmojisUpdated(e));
    socket.on("class:updated", (e) => st().patchClass(e.class.id, e.class));
    socket.on("class:refresh", (e) => st().loadClass(e.classId).catch(() => {}));
    socket.on("class:removed", ({ classId, reason }) => {
      const name = st().details[classId]?.class.name ?? "a class";
      st().dropClass(classId);
      if (reason === "kicked") st().toast(`A teacher removed you from ${name}`, "error");
      else if (reason === "deleted") st().toast(`${name} was deleted by its owner`);
      if (st().activeClassId === classId) navigate("/", { replace: true });
    });

    const prune = setInterval(() => st().pruneTyping(), 1000);
    return () => {
      clearInterval(prune);
      socket.disconnect();
      socket = null;
    };
  }, [meId]);

  // Unread badge in the tab title.
  useEffect(
    () =>
      useStore.subscribe((s) => {
        let n = 0;
        for (const d of Object.values(s.details)) {
          for (const c of Object.values(d.channels)) n += c.kind === "dm" ? c.unread : c.mentions;
        }
        document.title = n > 0 ? `(${n}) BubbleUp` : "BubbleUp";
      }),
    [],
  );
}

/** After a real reconnect (missed events), refresh the visible data. */
function resync() {
  const s = useStore.getState();
  if (s.activeClassId) s.loadClass(s.activeClassId).catch(() => {});
  const ch = s.activeChannelId;
  const list = ch && s.messages[ch];
  if (list?.loaded) {
    const last = [...list.items].reverse().find((m) => typeof m.id === "number");
    s.loadMessages(ch, last && !list.hasNewer ? "newer" : "latest", last?.id);
  }
}

function alertFor(message, channel) {
  const s = useStore.getState();
  const viewing = s.activeChannelId === channel.id && document.visibilityState === "visible" && document.hasFocus();
  const important = channel.kind === "dm" || mentions(message.body, s.me.username);
  if (viewing) {
    if (s.settings.sound && message.kind !== "system") playPop();
    return;
  }
  if (!important) return;
  if (s.settings.sound) playPop();
  const who = message.author?.displayName ?? "Someone";
  const where = channel.kind === "dm" ? "Direct message" : `#${channel.name}`;
  const text = message.body || (message.attachments?.length ? "sent a file" : message.poll ? "started a poll" : "");
  if (document.visibilityState !== "visible" || !document.hasFocus()) {
    showNotification(`${who} · ${where}`, text, () => navigate(chatPath(channel.classId, channel.id)));
  } else {
    s.toast(`${who} in ${where}: ${text.slice(0, 80)}`);
  }
}

/** Throttled "I'm typing" signal. */
let lastTypingSent = 0;
export function sendTyping(channelId) {
  const now = Date.now();
  if (!socket?.connected || now - lastTypingSent < 2500) return;
  lastTypingSent = now;
  socket.emit("typing", { channelId });
}

