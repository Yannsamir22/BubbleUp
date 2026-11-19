import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, connect, once, startServer, user } from "./helpers.js";
import { revealsWord, sameWord } from "../src/services/imposter.js";

let s;
let c;
const sockets = [];
beforeEach(async () => {
  s = await startServer({ listen: true });
  c = await classroom(s.url);
});
afterEach(async () => {
  sockets.splice(0).forEach((x) => x.disconnect());
  await s.stop();
});

async function member(name) {
  const agent = await user(s.url, name);
  await agent.post("/api/classes/join").send({ code: c.cls.class.studentCode }).expect(200);
  return agent;
}

/** Student hosts a random-word game; teacher, ana and ben join. Returns players by id. */
async function lobbyWithFour() {
  const res = await c.student.post(`/api/channels/${c.general.id}/imposter`).send({ mode: "random", category: "food" }).expect(201);
  const game = res.body.message.imposter;
  const ana = await member("ana");
  const ben = await member("ben");
  for (const p of [c.teacher, ana, ben]) await p.post(`/api/imposter/${game.id}/join`).expect(200);
  const agents = new Map([c.student, c.teacher, ana, ben].map((a) => [a.user.id, a]));
  return { game, agents, ana, ben };
}

async function start(game, agents) {
  const started = (await c.student.post(`/api/imposter/${game.id}/start`).expect(200)).body.game;
  const views = new Map();
  for (const [id, agent] of agents) views.set(id, (await agent.get(`/api/imposter/${game.id}`).expect(200)).body.game);
  const imposterId = [...views].find(([, v]) => v.me.role === "imposter")[0];
  const word = [...views].find(([, v]) => v.me.role === "player")[1].me.word;
  return { started, views, imposterId, word };
}

/** Plays both clue rounds with harmless clues. */
async function playClues(game, agents) {
  let g = (await c.student.get(`/api/imposter/${game.id}`)).body.game;
  let n = 0;
  while (g.status === "clues") {
    g = (await agents.get(g.turnUserId).post(`/api/imposter/${game.id}/clue`).send({ text: `hint ${n++}` }).expect(200)).body.game;
  }
  return g;
}

describe("imposter", () => {
  it("lobby: join rules, minimum players, only the host starts", async () => {
    const res = await c.student.post(`/api/channels/${c.general.id}/imposter`).send({ mode: "random" }).expect(201);
    const game = res.body.message.imposter;
    expect(game).toMatchObject({ status: "lobby", hostPlays: true, word: null, imposterId: null });
    expect(game.players.map((p) => p.id)).toEqual([c.student.user.id]);
    expect(JSON.stringify(res.body.message)).not.toMatch(/"word":"[a-z]/);

    await c.student.post(`/api/imposter/${game.id}/join`).expect(400); // already in
    await c.teacher.post(`/api/imposter/${game.id}/join`).expect(200);
    await c.student.post(`/api/imposter/${game.id}/start`).expect(400); // only 2 players
    const ana = await member("ana");
    await ana.post(`/api/imposter/${game.id}/join`).expect(200);
    await ana.post(`/api/imposter/${game.id}/start`).expect(403); // not the host
    await ana.post(`/api/imposter/${game.id}/leave`).expect(200);
    await ana.post(`/api/imposter/${game.id}/join`).expect(200);

    const stranger = await user(s.url, "stranger");
    await stranger.get(`/api/imposter/${game.id}`).expect(404);
    await stranger.post(`/api/imposter/${game.id}/join`).expect(404);

    await c.student.post(`/api/imposter/${game.id}/start`).expect(200);
    const late = await member("late");
    await late.post(`/api/imposter/${game.id}/join`).expect(400);
  });

  it("only non-imposters and nobody else learn the word", async () => {
    const { game, agents } = await lobbyWithFour();
    const { started, views, imposterId, word } = await start(game, agents);
    expect(started.category).toBe("Food");
    expect(started.word).toBeNull();
    expect(started.imposterId).toBeNull();

    const roles = [...views.values()].map((v) => v.me.role).sort();
    expect(roles).toEqual(["imposter", "player", "player", "player"]);
    expect(views.get(imposterId).me.word).toBeNull();
    for (const [id, v] of views) if (id !== imposterId) expect(v.me.word).toBe(word);

    // a classmate who is only watching sees clues later, never the word or the imposter
    const watcher = await member("watcher");
    const seen = (await watcher.get(`/api/imposter/${game.id}`)).body.game;
    expect(seen.me).toEqual({ role: "spectator", word: null });
    expect(JSON.stringify(seen)).not.toContain(`"${word}"`);
    await watcher.post(`/api/imposter/${game.id}/clue`).send({ text: "hello" }).expect(403);
  });

  it("clues in turn order; the word itself is refused, but not for the imposter", async () => {
    const { game, agents } = await lobbyWithFour();
    const { started, imposterId, word } = await start(game, agents);
    const order = started.players.map((p) => p.id);
    expect(started.turnUserId).toBe(order[0]);

    await agents.get(order[1]).post(`/api/imposter/${game.id}/clue`).send({ text: "early" }).expect(400);
    const first = agents.get(order[0]);
    if (order[0] !== imposterId) {
      const res = await first.post(`/api/imposter/${game.id}/clue`).send({ text: `${word}s` }).expect(400);
      expect(res.body.error).toMatch(/gives the secret word away/);
    }
    await first.post(`/api/imposter/${game.id}/clue`).send({ text: "one two three four" }).expect(400);
    const g = (await first.post(`/api/imposter/${game.id}/clue`).send({ text: "tasty" }).expect(200)).body.game;
    expect(g.clues).toEqual([{ userId: order[0], text: "tasty", round: 1 }]);
    expect(g.turnUserId).toBe(order[1]);

    const after = await playClues(game, agents);
    expect(after.status).toBe("voting");
    expect(after.clues).toHaveLength(order.length * 2);
  });

  it("everyone votes the imposter → they guess the word to steal the win", async () => {
    const { game, agents } = await lobbyWithFour();
    const { imposterId, word } = await start(game, agents);
    await playClues(game, agents);

    const ids = [...agents.keys()];
    await agents.get(ids[0]).post(`/api/imposter/${game.id}/vote`).send({ targetId: ids[0] }).expect(400); // not yourself
    for (const id of ids) {
      const target = id === imposterId ? ids.find((x) => x !== id) : imposterId;
      await agents.get(id).post(`/api/imposter/${game.id}/vote`).send({ targetId: target }).expect(200);
    }
    const caught = (await c.teacher.get(`/api/imposter/${game.id}`)).body.game;
    expect(caught).toMatchObject({ status: "guess", imposterId, accusedId: imposterId, word: null });

    const other = ids.find((x) => x !== imposterId);
    await agents.get(other).post(`/api/imposter/${game.id}/guess`).send({ text: word }).expect(403);
    const done = (await agents.get(imposterId).post(`/api/imposter/${game.id}/guess`).send({ text: word.toUpperCase() }).expect(200)).body.game;
    expect(done).toMatchObject({ status: "finished", result: "imposter", reason: "guessed", word });
  });

  it("a tie or a wrong vote lets the imposter win", async () => {
    const { game, agents } = await lobbyWithFour();
    const { imposterId } = await start(game, agents);
    await playClues(game, agents);
    const innocent = [...agents.keys()].filter((x) => x !== imposterId);
    // everybody blames the first innocent player (who blames the second)
    for (const id of agents.keys()) {
      const target = id === innocent[0] ? innocent[1] : innocent[0];
      await agents.get(id).post(`/api/imposter/${game.id}/vote`).send({ targetId: target }).expect(200);
    }
    const g = (await c.student.get(`/api/imposter/${game.id}`)).body.game;
    expect(g).toMatchObject({ status: "finished", result: "imposter", reason: "wrong_vote", accusedId: innocent[0], imposterId });
    expect(g.votes).toHaveLength(4);
  });

  it("custom word: the host runs the game without playing; host and teachers can skip and cancel", async () => {
    const res = await c.teacher.post(`/api/channels/${c.general.id}/imposter`).send({ mode: "custom", category: "Planets", word: "Saturn" }).expect(201);
    const game = res.body.message.imposter;
    expect(game.players).toEqual([]);
    await c.teacher.post(`/api/imposter/${game.id}/join`).expect(400);
    const agents = new Map();
    for (const a of [c.student, await member("ana"), await member("ben")]) {
      await a.post(`/api/imposter/${game.id}/join`).expect(200);
      agents.set(a.user.id, a);
    }
    const started = (await c.teacher.post(`/api/imposter/${game.id}/start`).expect(200)).body.game;
    expect(started.me).toEqual({ role: "host", word: "Saturn" });

    const skipped = (await c.teacher.post(`/api/imposter/${game.id}/advance`).expect(200)).body.game;
    expect(skipped.clues[0]).toMatchObject({ userId: started.turnUserId, text: null, skipped: true });
    await agents.get(skipped.turnUserId).post(`/api/imposter/${game.id}/advance`).expect(403);

    const over = (await c.teacher.post(`/api/imposter/${game.id}/cancel`).expect(200)).body.game;
    expect(over).toMatchObject({ status: "cancelled", word: "Saturn" });
  });

  it("refuses DMs; /imposter posts a lobby", async () => {
    const dm = (await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: c.teacher.user.id })).body.channel;
    await c.student.post(`/api/channels/${dm.id}/imposter`).send({ mode: "random" }).expect(400);
    const viaSlash = await c.student.post(`/api/channels/${c.general.id}/messages`).send({ body: "/imposter animals" }).expect(201);
    expect(viaSlash.body.message.imposter).toMatchObject({ status: "lobby", category: "Animals" });
    const bad = await c.student.post(`/api/channels/${c.general.id}/messages`).send({ body: "/imposter dinosaurs" }).expect(200);
    expect(bad.body.ephemeral.body).toMatch(/Unknown category/);
  });

  it("realtime: public updates to the channel, secrets only to each player, live watcher list", async () => {
    const { game, agents, ana } = await lobbyWithFour();
    const watcher = await member("watcher");
    const wSock = await connect(s.url, watcher.cookie);
    const aSock = await connect(s.url, ana.cookie);
    sockets.push(wSock, aSock);

    const snapshot = await wSock.emitWithAck("imposter:watch", { gameId: game.id });
    expect(snapshot).toMatchObject({ ok: true, game: { id: game.id, me: { role: "spectator" } } });
    const watchers = once(wSock, "imposter:watchers", (d) => d.userIds.length === 2);
    await aSock.emitWithAck("imposter:watch", { gameId: game.id });
    expect((await watchers).userIds.sort()).toEqual([ana.user.id, watcher.user.id].sort());

    let leaked = false;
    wSock.on("imposter:secret", () => (leaked = true));
    const update = once(wSock, "imposter:update", (d) => d.game.status === "clues");
    const secret = once(aSock, "imposter:secret", (d) => d.gameId === game.id);
    await c.student.post(`/api/imposter/${game.id}/start`).expect(200);
    const pub = (await update).game;
    expect(pub.word).toBeNull();
    expect(pub.imposterId).toBeNull();
    expect(pub).not.toHaveProperty("me");
    expect(["player", "imposter"]).toContain((await secret).me.role);
    expect(leaked).toBe(false);

    const stranger = await user(s.url, "stranger");
    const sSock = await connect(s.url, stranger.cookie);
    sockets.push(sSock);
    expect(await sSock.emitWithAck("imposter:watch", { gameId: game.id })).toMatchObject({ ok: false });
    expect(agents.size).toBe(4);
  });
});

describe("imposter word matching", () => {
  it("catches the word, plurals, spacing and accents but not unrelated words", () => {
    expect(revealsWord("Pizzas!", "pizza")).toBe(true);
    expect(revealsWord("cold ice-cream", "ice cream")).toBe(true);
    expect(revealsWord("icecream", "ice cream")).toBe(true);
    expect(revealsWord("Café", "cafe")).toBe(true);
    expect(revealsWord("cheesy", "cheese")).toBe(false);
    expect(revealsWord("bowl", "owl")).toBe(false);
    expect(sameWord("Elephants", "elephant")).toBe(true);
    expect(sameWord("dog", "cat")).toBe(false);
  });
});
