import { create } from "zustand";
import { api } from "../lib/api.js";
import { storage } from "../lib/browser.js";
import { mentions } from "../lib/markdown.jsx";

let tempSeq = 0;
const PAGE = 50;

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

/** Merge messages into a sorted list, replacing by id or pending clientId. */
function upsertMessages(items, incoming, clientId) {
  let next = items;
  for (const msg of incoming) {
    let idx = next.findIndex((m) => m.id === msg.id || (clientId && m.clientId === clientId));
    if (idx === -1 && next.length && msg.id < next[0].id) idx = -2; // older than window: ignore unless it fits
    if (idx >= 0) {
      next = next.slice();
      // Keep my own poll selection if the broadcast stripped it.
      const prev = next[idx];
      const poll = msg.poll && prev.poll && msg.poll.myVotes === undefined ? { ...msg.poll, myVotes: prev.poll.myVotes } : msg.poll;
      next[idx] = { ...msg, poll };
    } else if (idx === -1) {
      next = [...next, msg];
    }
  }
  // Real messages sorted by id; pending (temp) ones stay at the end.
  return next.slice().sort((a, b) => {
    const pa = typeof a.id === "string";
    const pb = typeof b.id === "string";
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? a.createdAt - b.createdAt : a.id - b.id;
  });
}

export const useStore = create((set, get) => ({
  // ---------------- state ----------------
  status: "booting", // booting | anon | ready
  me: null,
  classes: [],
  details: {},
  messages: {},
  ephemeral: {},
  typing: {},
  reads: {},
  online: {},
  replyTo: {},
  editingId: null,
  touchActiveId: null, // message whose actions are shown on touch screens
  panel: null, // members | pins | search
  sidebarOpen: false,
  modal: null,
  toasts: [],
  jump: null,
  games: {}, // live chess games by id (from realtime updates)
  calendarEvents: {},
  imposter: {}, // Imposter games by id: public view only (no word, no imposter)
  imposterMe: {}, // my own secret per Imposter game: { role, word, version }
  imposterWatchers: {}, // user ids with each Imposter game open
  connection: "connecting",
  activeClassId: null,
  activeChannelId: null,
  settings: {
    theme: storage.get("theme", "system"),
    sound: storage.get("sound", true),
    effects: storage.get("effects", true),
  },
  /** Getting-started checklist: which steps this person has done (saved per user). */
  progress: {},

  // ---------------- onboarding ----------------
  loadProgress() {
    const id = get().me?.id;
    if (id) set({ progress: storage.get(`progress:${id}`, {}) });
  },
  markDone(step) {
    const { me, progress } = get();
    if (!me || progress[step]) return;
    const next = { ...progress, [step]: Date.now() };
    storage.set(`progress:${me.id}`, next);
    set({ progress: next });
  },

  // ---------------- ui ----------------
  toast(message, tone = "info") {
    const id = ++tempSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 5000 : 3200);
  },
  openModal(type, props = {}) {
    if (type === "invite") get().markDone("invite");
    if (type === "help") get().markDone("help");
    set({ modal: { type, props } });
  },
  closeModal: () => set({ modal: null }),
  setPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  setSidebar: (open) => set({ sidebarOpen: open }),
  setReplyTo: (channelId, message) => set((s) => ({ replyTo: { ...s.replyTo, [channelId]: message }, editingId: null })),
  setEditing: (id) => set({ editingId: id }),
  setTouchActive: (id) => set((s) => ({ touchActiveId: s.touchActiveId === id ? null : id })),
  setSetting(key, value) {
    storage.set(key, value);
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
  },
  setActive: (activeClassId, activeChannelId) => set({ activeClassId, activeChannelId, editingId: null, sidebarOpen: false }),

  /** Wraps an async action: shows errors as toasts and rethrows. */
  async attempt(fn, { silent } = {}) {
    try {
      return await fn();
    } catch (err) {
      if (!silent) get().toast(err.message, "error");
      throw err;
    }
  },

  // ---------------- session ----------------
  async boot() {
    try {
      const { user } = await api.get("/auth/me");
      if (!user) return set({ status: "anon", me: null });
      set({ me: user });
      get().loadProgress();
      await get().loadClasses();
      set({ status: "ready" });
    } catch {
      set({ status: "anon", me: null });
    }
  },
  async login(username, password) {
    const { user } = await api.post("/auth/login", { username, password });
    set({ me: user });
    get().loadProgress();
    await get().loadClasses();
    set({ status: "ready" });
  },
  async register(username, password, displayName) {
    const { user } = await api.post("/auth/register", { username, password, displayName: displayName || undefined });
    set({ me: user, classes: [], status: "ready", progress: {} });
  },
  async logout() {
    await api.post("/auth/logout").catch(() => {});
    set({ status: "anon", me: null, classes: [], details: {}, messages: {}, ephemeral: {}, modal: null, panel: null, games: {}, calendarEvents: {}, imposter: {}, imposterMe: {}, imposterWatchers: {} });
  },
  async updateProfile(patch) {
    const { user } = await api.patch("/me", patch);
    set({ me: user });
    get().markDone("profile");
  },
  async changePassword(currentPassword, newPassword) {
    const { user } = await api.post("/me/password", { currentPassword, newPassword });
    set({ me: user });
  },

  // ---------------- classes ----------------
  async loadClasses() {
    const { classes } = await api.get("/classes");
    set({ classes });
    // Fetch every class in the background so the rail can show unread badges.
    for (const c of classes) get().loadClass(c.id).catch(() => {});
    return classes;
  },
  storeDetail(detail) {
    const classId = detail.class.id;
    set((s) => ({
      details: {
        ...s.details,
        [classId]: {
          class: detail.class,
          myRole: detail.myRole,
          channels: byId(detail.channels),
          members: byId(detail.members),
          emojis: detail.emojis ?? [],
        },
      },
      online: { ...s.online, ...Object.fromEntries(detail.members.map((m) => [m.id, m.online])) },
      classes: s.classes.some((c) => c.id === classId)
        ? s.classes.map((c) => (c.id === classId ? { ...c, ...summary(detail) } : c))
        : [...s.classes, summary(detail)],
    }));
    return classId;
  },
  async loadClass(classId) {
    return get().storeDetail(await api.get(`/classes/${classId}`));
  },
  async loadCalendar(classId) {
    const { events } = await api.get(`/classes/${classId}/events`);
    get().onCalendarUpdated({ classId, events });
    return events;
  },
  async createCalendarEvent(classId, event) {
    const { events } = await api.post(`/classes/${classId}/events`, event);
    get().onCalendarUpdated({ classId, events });
    return events;
  },
  async deleteCalendarEvent(classId, eventId) {
    const { events } = await api.del(`/classes/${classId}/events/${eventId}`);
    get().onCalendarUpdated({ classId, events });
    return events;
  },
  onCalendarUpdated({ classId, events }) {
    set((s) => ({ calendarEvents: { ...s.calendarEvents, [classId]: events } }));
  },
  async createClass(data) {
    return get().storeDetail(await api.post("/classes", data));
  },
  async joinClass(code) {
    const res = await api.post("/classes/join", { code });
    get().storeDetail(res);
    return res;
  },
  async updateClass(classId, patch) {
    const { class: cls } = await api.patch(`/classes/${classId}`, patch);
    get().patchClass(classId, cls);
  },
  async regenerateCodes(classId) {
    const { class: cls } = await api.post(`/classes/${classId}/codes`);
    get().patchClass(classId, cls);
  },
  async leaveClass(classId) {
    await api.post(`/classes/${classId}/leave`);
    get().dropClass(classId);
  },
  async deleteClass(classId) {
    await api.del(`/classes/${classId}`);
    get().dropClass(classId);
  },
  async setRole(classId, userId, role) {
    const { member } = await api.patch(`/classes/${classId}/members/${userId}`, { role });
    get().onMemberUpdated({ classId, member });
    if (role === "owner") await get().loadClass(classId);
  },
  async muteMember(classId, userId, minutes) {
    const { member } = await api.post(`/classes/${classId}/members/${userId}/mute`, { minutes });
    get().onMemberUpdated({ classId, member });
  },
  async kickMember(classId, userId) {
    await api.del(`/classes/${classId}/members/${userId}`);
    get().onMemberRemoved({ classId, userId });
  },
  patchClass(classId, cls) {
    set((s) => {
      const d = s.details[classId];
      if (!d) return {};
      return {
        details: { ...s.details, [classId]: { ...d, class: { ...d.class, ...cls } } },
        classes: s.classes.map((c) => (c.id === classId ? { ...c, name: cls.name ?? c.name, emoji: cls.emoji ?? c.emoji } : c)),
      };
    });
  },
  dropClass(classId) {
    set((s) => {
      const details = { ...s.details };
      const calendarEvents = { ...s.calendarEvents };
      delete details[classId];
      delete calendarEvents[classId];
      return { details, calendarEvents, classes: s.classes.filter((c) => c.id !== classId) };
    });
  },

  // ---------------- channels ----------------
  async createChannel(classId, data) {
    const { channel } = await api.post(`/classes/${classId}/channels`, data);
    get().onChannelCreated({ channel });
    get().markDone("channel");
    return channel;
  },
  async updateChannel(channelId, data) {
    const { channel } = await api.patch(`/channels/${channelId}`, data);
    get().onChannelUpdated({ channel });
  },
  async deleteChannel(classId, channelId) {
    await api.del(`/channels/${channelId}`);
    get().onChannelRemoved({ classId, channelId });
  },
  async openDm(classId, userId) {
    const { channel } = await api.post(`/classes/${classId}/dms`, { userId });
    get().onChannelCreated({ channel });
    return channel;
  },

  // ---------------- messages ----------------
  async loadMessages(channelId, mode = "latest", ref) {
    const cur = get().messages[channelId];
    if (cur?.loading) return;
    const patch = (p) =>
      set((s) => ({ messages: { ...s.messages, [channelId]: { items: [], hasMore: false, hasNewer: false, ...s.messages[channelId], ...p } } }));
    patch({ loading: true, error: null });
    try {
      let q = `?limit=${PAGE}`;
      if (mode === "older") q += `&before=${ref}`;
      if (mode === "newer") q += `&after=${ref}`;
      if (mode === "around") q += `&around=${ref}`;
      const res = await api.get(`/channels/${channelId}/messages${q}`);
      set((s) => {
        const prev = s.messages[channelId] ?? { items: [] };
        let items;
        let hasMore = prev.hasMore;
        let hasNewer = prev.hasNewer;
        if (mode === "older") {
          items = [...res.messages, ...prev.items];
          hasMore = res.hasMore;
        } else if (mode === "newer") {
          items = upsertMessages(prev.items, res.messages);
          hasNewer = res.hasNewer;
        } else {
          // latest/around replace the window, keeping pending sends
          const pending = mode === "latest" ? prev.items.filter((m) => typeof m.id === "string") : [];
          items = [...res.messages, ...pending];
          hasMore = res.hasMore;
          hasNewer = mode === "around" ? res.hasNewer : false;
        }
        return { messages: { ...s.messages, [channelId]: { items, hasMore, hasNewer, loading: false, loaded: true } } };
      });
    } catch (err) {
      patch({ loading: false, error: err.message });
    }
  },

  async jumpTo(channelId, messageId) {
    const list = get().messages[channelId];
    if (!list?.items.some((m) => m.id === messageId)) await get().loadMessages(channelId, "around", messageId);
    set({ jump: { channelId, messageId, nonce: ++tempSeq } });
  },

  async sendMessage(channelId, { body = "", attachments = [], poll = null }) {
    const { me } = get();
    const replyTo = get().replyTo[channelId] ?? null;
    const clientId = `c${Date.now().toString(36)}${++tempSeq}`;
    const temp = {
      id: `tmp-${clientId}`,
      clientId,
      channelId,
      kind: "user",
      author: me,
      body,
      createdAt: Date.now(),
      pending: true,
      reactions: [],
      attachments,
      replyTo: replyTo ? { id: replyTo.id, body: replyTo.body, author: replyTo.author } : null,
      poll: poll ? { ...poll, options: poll.options.map((text, i) => ({ id: -i, text, votes: 0 })), totalVoters: 0, myVotes: [] } : null,
    };
    const isCommand = body.startsWith("/") && !body.startsWith("//");
    set((s) => ({ replyTo: { ...s.replyTo, [channelId]: null } }));
    if (!isCommand) get().addLocal(channelId, temp);

    const payload = { body, clientId, replyToId: replyTo?.id ?? null, attachmentIds: attachments.map((a) => a.id), poll };
    try {
      const res = await api.post(`/channels/${channelId}/messages`, payload);
      if (res.ephemeral) {
        set((s) => ({
          ephemeral: { ...s.ephemeral, [channelId]: [...(s.ephemeral[channelId] ?? []), { ...res.ephemeral, id: `eph-${clientId}` }] },
        }));
        return;
      }
      get().onMessageNew({ message: res.message, clientId });
      const ch = findChannel(get(), channelId);
      const done = get().markDone;
      done("message");
      if (attachments.length) done("file");
      if (poll || res.message.poll) done("poll");
      if (ch?.kind === "dm") done("dm");
      if (ch?.kind === "announcement") done("announce");
    } catch (err) {
      if (isCommand) {
        get().toast(err.message, "error");
        return;
      }
      get().patchLocal(channelId, temp.id, { pending: false, failed: err.message, retry: payload });
    }
  },

  async retrySend(channelId, temp) {
    get().removeLocal(channelId, temp.id);
    const res = await get()
      .attempt(() => api.post(`/channels/${channelId}/messages`, temp.retry))
      .catch(() => null);
    if (res?.message) get().onMessageNew({ message: res.message });
  },

  addLocal(channelId, msg) {
    set((s) => {
      const list = s.messages[channelId] ?? { items: [], loaded: true };
      return { messages: { ...s.messages, [channelId]: { ...list, items: [...list.items, msg] } } };
    });
  },
  patchLocal(channelId, id, patch) {
    set((s) => {
      const list = s.messages[channelId];
      if (!list) return {};
      return { messages: { ...s.messages, [channelId]: { ...list, items: list.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } } };
    });
  },
  removeLocal(channelId, id) {
    set((s) => {
      const list = s.messages[channelId];
      if (!list) return {};
      return { messages: { ...s.messages, [channelId]: { ...list, items: list.items.filter((m) => m.id !== id) } } };
    });
  },
  dismissEphemeral(channelId, id) {
    set((s) => ({ ephemeral: { ...s.ephemeral, [channelId]: (s.ephemeral[channelId] ?? []).filter((e) => e.id !== id) } }));
  },

  async editMessage(message, body) {
    const { message: updated } = await api.patch(`/messages/${message.id}`, { body });
    get().onMessageUpdated({ message: updated });
    set({ editingId: null });
  },
  async deleteMessage(message) {
    await api.del(`/messages/${message.id}`);
    get().patchLocal(message.channelId, message.id, { deleted: true, body: "", attachments: [], reactions: [], poll: null });
  },
  async toggleReaction(message, emoji) {
    // Optimistic: flip locally, then reconcile with the server's answer.
    const meId = get().me.id;
    const has = message.reactions.some((r) => r.emoji === emoji && r.userIds.includes(meId));
    const optimistic = has
      ? message.reactions
          .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, userIds: r.userIds.filter((u) => u !== meId) } : r))
          .filter((r) => r.count > 0)
      : message.reactions.some((r) => r.emoji === emoji)
        ? message.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, meId] } : r))
        : [...message.reactions, { emoji, count: 1, userIds: [meId] }];
    get().patchLocal(message.channelId, message.id, { reactions: optimistic });
    get().markDone("react");
    try {
      const { reactions } = await api.post(`/messages/${message.id}/reactions`, { emoji });
      get().patchLocal(message.channelId, message.id, { reactions });
    } catch (err) {
      get().patchLocal(message.channelId, message.id, { reactions: message.reactions });
      get().toast(err.message, "error");
    }
  },
  async setPinned(message, pinned) {
    const { message: updated } = await api[pinned ? "put" : "del"](`/messages/${message.id}/pin`);
    get().onMessageUpdated({ message: updated });
    get().toast(pinned ? "Message pinned" : "Message unpinned");
  },
  async vote(message, optionIds) {
    const { message: updated } = await api.post(`/messages/${message.id}/vote`, { optionIds });
    get().onMessageUpdated({ message: updated });
  },
  async closePoll(message) {
    const { message: updated } = await api.post(`/messages/${message.id}/close-poll`);
    get().onMessageUpdated({ message: updated });
  },

  /** Marks the channel read up to its newest message (server de-dupes). */
  markRead(channelId) {
    const ch = findChannel(get(), channelId);
    if (!ch || (ch.unread === 0 && ch.mentions === 0 && ch.lastReadId >= ch.lastMessageId)) return;
    get().patchChannel(ch.classId, channelId, { unread: 0, mentions: 0, lastReadId: ch.lastMessageId });
    api.post(`/channels/${channelId}/read`, {}).catch(() => {});
  },
  async loadReads(channelId) {
    const { reads } = await api.get(`/channels/${channelId}/reads`);
    set((s) => ({ reads: { ...s.reads, [channelId]: Object.fromEntries(reads.map((r) => [r.userId, r.lastReadId])) } }));
  },
  patchChannel(classId, channelId, patch) {
    set((s) => {
      const d = s.details[classId];
      const ch = d?.channels[channelId];
      if (!ch) return {};
      return { details: { ...s.details, [classId]: { ...d, channels: { ...d.channels, [channelId]: { ...ch, ...patch } } } } };
    });
  },

  // ---------------- games & fun ----------------
  async challengeChess(channelId, opponentId) {
    const { message } = await api.post(`/channels/${channelId}/chess`, { opponentId });
    get().onMessageNew({ message });
    get().markDone("chess");
    return message;
  },
  async chessAction(gameId, action, body) {
    const { game } = await api.post(`/chess/${gameId}/${action}`, body);
    get().onChessUpdate({ game });
    return game;
  },
  async loadGame(gameId) {
    const { game } = await api.get(`/chess/${gameId}`);
    get().onChessUpdate({ game });
    return game;
  },
  onChessUpdate({ game }) {
    set((s) => ({ games: { ...s.games, [game.id]: game } }));
  },

  // ---------------- imposter ----------------
  imposterCategories: null,
  async loadImposterCategories() {
    if (get().imposterCategories) return get().imposterCategories;
    const { categories } = await api.get("/imposter/categories");
    set({ imposterCategories: categories });
    return categories;
  },
  async createImposter(channelId, opts) {
    const { message } = await api.post(`/channels/${channelId}/imposter`, opts);
    get().onMessageNew({ message });
    return message;
  },
  async imposterAction(gameId, action, body) {
    const { game } = await api.post(`/imposter/${gameId}/${action}`, body);
    get().onImposterUpdate({ game });
    return game;
  },
  async loadImposter(gameId) {
    const { game } = await api.get(`/imposter/${gameId}`);
    get().onImposterUpdate({ game });
    return game;
  },
  /**
   * The same change reaches us twice (HTTP reply + broadcast) in either order,
   * so anything older than what we hold is ignored.
   */
  onImposterUpdate({ game }) {
    const { me, ...pub } = game;
    set((s) => {
      const patch = {};
      const old = s.imposter[pub.id];
      if (!old || pub.version > old.version) patch.imposter = { ...s.imposter, [pub.id]: pub };
      if (me) {
        const mine = s.imposterMe[pub.id];
        if (!mine || pub.version >= mine.version) patch.imposterMe = { ...s.imposterMe, [pub.id]: { ...me, version: pub.version } };
      }
      return patch;
    });
  },
  onImposterSecret({ gameId, version, me }) {
    set((s) => {
      const mine = s.imposterMe[gameId];
      if (mine && mine.version > version) return {};
      return { imposterMe: { ...s.imposterMe, [gameId]: { ...me, version } } };
    });
  },
  onImposterWatchers({ gameId, userIds }) {
    set((s) => ({ imposterWatchers: { ...s.imposterWatchers, [gameId]: userIds } }));
  },
  async addEmoji(classId, file, name) {
    const { emoji } = await api.upload(`/classes/${classId}/emojis`, file, { name });
    const d = get().details[classId];
    if (d && !d.emojis.some((e) => e.id === emoji.id)) get().onEmojisUpdated({ classId, emojis: [...d.emojis, emoji].sort((a, b) => a.name.localeCompare(b.name)) });
    return emoji;
  },
  async removeEmoji(classId, name) {
    await api.del(`/classes/${classId}/emojis/${encodeURIComponent(name)}`);
    const d = get().details[classId];
    if (d) get().onEmojisUpdated({ classId, emojis: d.emojis.filter((e) => e.name !== name) });
  },
  onEmojisUpdated({ classId, emojis }) {
    set((s) => {
      const d = s.details[classId];
      return d ? { details: { ...s.details, [classId]: { ...d, emojis } } } : {};
    });
  },

  // ---------------- realtime reducers ----------------
  onMessageNew({ message, clientId }) {
    const s = get();
    const ch = findChannel(s, message.channelId);
    const list = s.messages[message.channelId];
    if (list?.loaded && !list.hasNewer) {
      set((st) => ({
        messages: {
          ...st.messages,
          [message.channelId]: { ...list, items: upsertMessages(st.messages[message.channelId].items, [message], clientId) },
        },
      }));
    }
    // Typing stops when the message lands.
    if (message.author && s.typing[message.channelId]?.[message.author.id]) {
      set((st) => {
        const t = { ...st.typing[message.channelId] };
        delete t[message.author.id];
        return { typing: { ...st.typing, [message.channelId]: t } };
      });
    }
    if (!ch) return { isNew: false };
    const mine = message.author?.id === s.me?.id && message.kind === "user";
    const isNewer = message.id > (ch.lastMessageId ?? 0);
    if (!isNewer) return { isNew: false };
    const counts = !mine && message.kind !== "system";
    get().patchChannel(ch.classId, ch.id, {
      lastMessageId: message.id,
      lastMessageAt: message.createdAt,
      ...(mine ? { lastReadId: message.id, unread: 0, mentions: 0 } : {}),
      ...(counts ? { unread: ch.unread + 1, mentions: ch.mentions + (mentions(message.body, s.me.username) ? 1 : 0) } : {}),
    });
    return { isNew: counts, channel: ch };
  },
  onMessageUpdated({ message }) {
    const list = get().messages[message.channelId];
    if (!list) return;
    if (!list.items.some((m) => m.id === message.id)) return;
    set((s) => ({ messages: { ...s.messages, [message.channelId]: { ...list, items: upsertMessages(s.messages[message.channelId].items, [message]) } } }));
  },
  onReactions({ messageId, channelId, reactions }) {
    get().patchLocal(channelId, messageId, { reactions });
  },
  onTyping({ channelId, userId }) {
    if (userId === get().me?.id) return;
    set((s) => ({ typing: { ...s.typing, [channelId]: { ...s.typing[channelId], [userId]: Date.now() + 4500 } } }));
  },
  pruneTyping() {
    const now = Date.now();
    const { typing } = get();
    let changed = false;
    const next = {};
    for (const [cid, users] of Object.entries(typing)) {
      const kept = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
      if (Object.keys(kept).length !== Object.keys(users).length) changed = true;
      next[cid] = kept;
    }
    if (changed) set({ typing: next });
  },
  onPresence({ userId, online }) {
    set((s) => ({ online: { ...s.online, [userId]: online } }));
  },
  onRead({ channelId, userId, lastReadId }) {
    if (userId === get().me?.id) {
      const ch = findChannel(get(), channelId);
      if (ch && lastReadId >= (ch.lastMessageId ?? 0)) get().patchChannel(ch.classId, channelId, { unread: 0, mentions: 0, lastReadId });
    }
    set((s) => ({ reads: { ...s.reads, [channelId]: { ...s.reads[channelId], [userId]: lastReadId } } }));
  },
  onChannelCreated({ channel }) {
    const d = get().details[channel.classId];
    if (!d) return;
    const prev = d.channels[channel.id];
    get().patchChannelMap(channel.classId, { [channel.id]: { unread: 0, mentions: 0, lastReadId: 0, lastMessageId: 0, ...prev, ...channel } });
  },
  onChannelUpdated({ channel }) {
    get().patchChannel(channel.classId, channel.id, channel);
  },
  onChannelRemoved({ classId, channelId }) {
    set((s) => {
      const d = s.details[classId];
      if (!d) return {};
      const channels = { ...d.channels };
      delete channels[channelId];
      return { details: { ...s.details, [classId]: { ...d, channels } } };
    });
  },
  patchChannelMap(classId, patch) {
    set((s) => {
      const d = s.details[classId];
      return { details: { ...s.details, [classId]: { ...d, channels: { ...d.channels, ...patch } } } };
    });
  },
  onMemberUpdated({ classId, member }) {
    set((s) => {
      const d = s.details[classId];
      if (!d) return {};
      const isMe = member.id === s.me?.id;
      return {
        details: {
          ...s.details,
          [classId]: { ...d, myRole: isMe ? member.role : d.myRole, members: { ...d.members, [member.id]: { ...d.members[member.id], ...member } } },
        },
        online: member.online !== undefined ? { ...s.online, [member.id]: member.online } : s.online,
      };
    });
  },
  onMemberRemoved({ classId, userId }) {
    set((s) => {
      const d = s.details[classId];
      if (!d) return {};
      const members = { ...d.members };
      delete members[userId];
      return { details: { ...s.details, [classId]: { ...d, members } } };
    });
  },
  onUserUpdated({ user }) {
    set((s) => {
      const details = { ...s.details };
      for (const [cid, d] of Object.entries(details)) {
        if (d.members[user.id]) details[cid] = { ...d, members: { ...d.members, [user.id]: { ...d.members[user.id], ...user } } };
      }
      return { details };
    });
  },
}));

function summary(detail) {
  return { id: detail.class.id, name: detail.class.name, emoji: detail.class.emoji, description: detail.class.description, role: detail.myRole };
}

export function findChannel(state, channelId) {
  for (const d of Object.values(state.details)) if (d.channels[channelId]) return d.channels[channelId];
  return null;
}

export const isStaffRole = (role) => role === "teacher" || role === "owner";
