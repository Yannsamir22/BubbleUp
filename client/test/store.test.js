import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/store/index.js";

const me = { id: 1, username: "me", displayName: "Me" };
const other = { id: 2, username: "pal", displayName: "Pal" };

function seed() {
  useStore.setState({
    me,
    details: {
      10: {
        class: { id: 10, name: "C" },
        myRole: "student",
        members: { 1: me, 2: other },
        channels: { 100: { id: 100, classId: 10, kind: "text", name: "general", unread: 0, mentions: 0, lastReadId: 5, lastMessageId: 5 } },
      },
    },
    messages: { 100: { items: [{ id: 5, channelId: 100, kind: "user", author: other, body: "old", createdAt: 1, reactions: [] }], loaded: true, hasMore: false, hasNewer: false } },
    typing: {},
  });
}

const msg = (id, author, body, extra = {}) => ({ id, channelId: 100, kind: "user", author, body, createdAt: Date.now(), reactions: [], ...extra });

describe("store realtime reducers", () => {
  beforeEach(seed);

  it("appends new messages and counts unread + mentions from others", () => {
    useStore.getState().onMessageNew({ message: msg(6, other, "hi @me") });
    useStore.getState().onMessageNew({ message: msg(7, other, "plain") });
    const st = useStore.getState();
    expect(st.messages[100].items.map((m) => m.id)).toEqual([5, 6, 7]);
    expect(st.details[10].channels[100]).toMatchObject({ unread: 2, mentions: 1, lastMessageId: 7 });
  });

  it("ignores duplicates (socket echo of my own send)", () => {
    const m = msg(6, other, "dup");
    useStore.getState().onMessageNew({ message: m });
    useStore.getState().onMessageNew({ message: m });
    expect(useStore.getState().messages[100].items).toHaveLength(2);
    expect(useStore.getState().details[10].channels[100].unread).toBe(1);
  });

  it("replaces my optimistic message when the server echo arrives", () => {
    useStore.getState().addLocal(100, { ...msg("tmp-x", me, "hello"), clientId: "x", pending: true });
    useStore.getState().onMessageNew({ message: msg(9, me, "hello"), clientId: "x" });
    const items = useStore.getState().messages[100].items;
    expect(items.map((m) => m.id)).toEqual([5, 9]);
    expect(items[1].pending).toBeUndefined();
    expect(useStore.getState().details[10].channels[100]).toMatchObject({ unread: 0, lastReadId: 9 });
  });

  it("keeps my poll selection when a broadcast strips it", () => {
    const poll = { question: "Q", options: [{ id: 1, text: "a", votes: 1 }], totalVoters: 1, myVotes: [1] };
    useStore.getState().onMessageNew({ message: msg(6, other, "", { poll }) });
    const { myVotes, ...stripped } = poll;
    void myVotes;
    useStore.getState().onMessageUpdated({ message: msg(6, other, "", { poll: { ...stripped, totalVoters: 2 } }) });
    const p = useStore.getState().messages[100].items.find((m) => m.id === 6).poll;
    expect(p).toMatchObject({ totalVoters: 2, myVotes: [1] });
  });

  it("clears typing when that person's message lands, and tracks presence", () => {
    useStore.getState().onTyping({ channelId: 100, userId: 2 });
    expect(useStore.getState().typing[100][2]).toBeGreaterThan(Date.now());
    useStore.getState().onMessageNew({ message: msg(6, other, "done typing") });
    expect(useStore.getState().typing[100][2]).toBeUndefined();
    useStore.getState().onPresence({ userId: 2, online: true });
    expect(useStore.getState().online[2]).toBe(true);
  });

  it("does not inject live messages into an old 'jumped' window", () => {
    useStore.setState((s) => ({ messages: { 100: { ...s.messages[100], hasNewer: true } } }));
    useStore.getState().onMessageNew({ message: msg(50, other, "far future") });
    expect(useStore.getState().messages[100].items.map((m) => m.id)).toEqual([5]);
    expect(useStore.getState().details[10].channels[100].unread).toBe(1);
  });
});

describe("imposter reducers", () => {
  beforeEach(() => useStore.setState({ imposter: {}, imposterMe: {}, imposterWatchers: {} }));
  const pub = (version, extra = {}) => ({ id: 7, version, status: "clues", players: [], clues: [], ...extra });

  it("ignores updates older than what it holds (HTTP reply and broadcast can arrive in either order)", () => {
    const st = useStore.getState;
    st().onImposterUpdate({ game: pub(3, { clues: [{ userId: 1, text: "new", round: 1 }] }) });
    st().onImposterUpdate({ game: pub(2) });
    expect(st().imposter[7].clues).toHaveLength(1);
    st().onImposterUpdate({ game: pub(4, { status: "voting" }) });
    expect(st().imposter[7].status).toBe("voting");
  });

  it("keeps the secret apart from the public game and never lets a stale reply erase it", () => {
    const st = useStore.getState;
    st().onImposterSecret({ gameId: 7, version: 5, me: { role: "player", word: "pizza" } });
    st().onImposterUpdate({ game: { ...pub(4, { status: "lobby" }), me: { role: "player", word: null } } });
    expect(st().imposterMe[7].word).toBe("pizza");
    expect(st().imposter[7]).not.toHaveProperty("me");
  });
});
