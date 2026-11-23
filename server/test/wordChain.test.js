import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user } from "./helpers.js";
import { isKnownWord, dictionarySize } from "../src/services/wordChainWords.js";

let server;
let group;

beforeEach(async () => {
  server = await startServer();
  group = await classroom(server.app);
});

afterEach(async () => server.stop());

async function member(name) {
  const agent = await user(server.app, name);
  await agent.post("/api/classes/join").send({ code: group.cls.class.studentCode }).expect(200);
  return agent;
}

/** Student hosts, teacher joins, game starts with the student to play. */
async function started(options = {}) {
  const game = (await group.student.post(`/api/channels/${group.general.id}/word-chain`).send(options).expect(201)).body.message.wordChain;
  await group.teacher.post(`/api/word-chain/${game.id}/join`).expect(200);
  return (await group.student.post(`/api/word-chain/${game.id}/start`).expect(200)).body.game;
}

const play = (agent, game, word) => agent.post(`/api/word-chain/${game.id}/play`).send({ word });

describe("Word Chain dictionary", () => {
  it("knows English and French words, ignoring case, accents and regular plurals", () => {
    expect(dictionarySize("en")).toBeGreaterThan(700);
    expect(dictionarySize("fr")).toBeGreaterThan(700);
    expect(isKnownWord("en", "Elephant")).toBe(true);
    expect(isKnownWord("en", "berries")).toBe(true);
    expect(isKnownWord("en", "foxes")).toBe(true);
    expect(isKnownWord("en", "blorp")).toBe(false);
    expect(isKnownWord("fr", "élève")).toBe(true);
    expect(isKnownWord("fr", "ELEVE")).toBe(true);
    expect(isKnownWord("fr", "chevaux")).toBe(true);
    expect(isKnownWord("fr", "Œuf")).toBe(true);
    expect(isKnownWord("fr", "elephant")).toBe(true);
    expect(isKnownWord("fr", "pizza")).toBe(false);
  });
});

describe("Word Chain", () => {
  it("creates a lobby, enforces players and turns, and accepts a valid chain", async () => {
    const created = await group.student.post(`/api/channels/${group.general.id}/word-chain`).expect(201);
    const game = created.body.message.wordChain;
    expect(game).toMatchObject({ status: "lobby", language: "en", turnSeconds: 30, maxLives: 3, minPlayers: 2, maxPlayers: 10 });
    await group.student.post(`/api/word-chain/${game.id}/start`).expect(400);

    await group.teacher.post(`/api/word-chain/${game.id}/join`).expect(200);
    const running = (await group.student.post(`/api/word-chain/${game.id}/start`).expect(200)).body.game;
    expect(running.turnUserId).toBe(group.student.user.id);
    expect(running.lives).toEqual({ [group.student.user.id]: 3, [group.teacher.user.id]: 3 });
    expect(running.turnDeadline).toBeGreaterThan(Date.now());

    await play(group.teacher, game, "elephant").expect(400); // not their turn
    await play(group.student, game, "two words").expect(400); // format errors cost nothing

    for (const [agent, word] of [[group.student, "apple"], [group.teacher, "elephant"], [group.student, "tiger"], [group.teacher, "rivers"]]) {
      const res = (await play(agent, game, word).expect(200)).body;
      expect(res.penalty).toBeNull();
    }
    const final = (await play(group.student, game, "Snakes").expect(200)).body.game;
    expect(final.chain.map((entry) => entry.word)).toEqual(["apple", "elephant", "tiger", "rivers", "Snakes"]);
    expect(final.lives[group.student.user.id]).toBe(3);
  });

  it("costs a life for unknown, off-letter or repeated words, and the last player standing wins", async () => {
    const game = await started();
    const student = group.student.user.id;
    const teacher = group.teacher.user.id;

    let res = (await play(group.student, game, "blorp").expect(200)).body;
    expect(res.penalty).toMatch(/isn't in the English word list.*2 left/);
    expect(res.game.lives[student]).toBe(2);
    expect(res.game.turnUserId).toBe(teacher);
    expect(res.game.chain).toEqual([]);

    await play(group.teacher, game, "apple").expect(200);
    res = (await play(group.student, game, "banana").expect(200)).body; // must start with E
    expect(res.penalty).toMatch(/doesn't start with “E”/);
    await play(group.teacher, game, "egg").expect(200);
    res = (await play(group.student, game, "egg").expect(200)).body; // must start with G: third mistake
    expect(res.penalty).toMatch(/You're out!/);
    expect(res.game).toMatchObject({ status: "finished", turnUserId: null, outOrder: [student] });
    expect(res.game.winner.id).toBe(teacher);
    expect(res.game.lives[student]).toBe(0);
    await play(group.teacher, game, "goat").expect(400);
  });

  it("flags a repeated word that does start with the right letter", async () => {
    const game = await started();
    await play(group.student, game, "toast").expect(200);
    const res = (await play(group.teacher, game, "toast").expect(200)).body;
    expect(res.penalty).toMatch(/was already used/);
  });

  it("takes a life when the turn timer runs out and skips eliminated players", async () => {
    const ana = await member("ana");
    const game = (await group.student.post(`/api/channels/${group.general.id}/word-chain`).send({ turnSeconds: 15 }).expect(201)).body.message.wordChain;
    await group.teacher.post(`/api/word-chain/${game.id}/join`).expect(200);
    await ana.post(`/api/word-chain/${game.id}/join`).expect(200);
    await group.student.post(`/api/word-chain/${game.id}/start`).expect(200);

    let t = Date.now();
    for (let i = 0; i < 3; i++) {
      // Only the student ever times out; the others answer.
      t += 20_000;
      expect(server.expireWordChainTurns(t)).toBe(1);
      const current = (await group.student.get(`/api/word-chain/${game.id}`).expect(200)).body.game;
      expect(current.lastEvent).toMatchObject({ type: "timeout", userId: group.student.user.id });
      if (i < 2) {
        expect(current.turnUserId).toBe(group.teacher.user.id);
        const last = current.chain.at(-1)?.word;
        await play(group.teacher, game, last ? (last.endsWith("e") ? "egg" : "tiger") : "apple").expect(200);
        const after = (await ana.get(`/api/word-chain/${game.id}`)).body.game;
        await play(ana, game, after.chain.at(-1).word.endsWith("e") ? "eagle" : "goat").expect(200);
      }
    }
    const current = (await group.student.get(`/api/word-chain/${game.id}`).expect(200)).body.game;
    expect(current.status).toBe("playing");
    expect(current.lives[group.student.user.id]).toBe(0);
    expect(current.outOrder).toEqual([group.student.user.id]);
    expect(current.turnUserId).toBe(group.teacher.user.id);
    expect(server.expireWordChainTurns(Date.now())).toBe(0);
  });

  it("plays in French with accents and lets a player give up", async () => {
    const game = await started({ language: "fr" });
    expect(game.language).toBe("fr");
    await play(group.student, game, "élève").expect(200);
    let res = (await play(group.teacher, game, "pizza").expect(200)).body;
    expect(res.penalty).toMatch(/ne commence pas par « E »/);
    res = (await play(group.student, game, "Éléphant").expect(200)).body;
    expect(res.penalty).toBeNull();
    res = (await play(group.teacher, game, "tortues").expect(200)).body;
    expect(res.penalty).toBeNull();

    await group.student.post(`/api/word-chain/${game.id}/forfeit`).expect(200);
    const over = (await group.teacher.get(`/api/word-chain/${game.id}`).expect(200)).body.game;
    expect(over).toMatchObject({ status: "finished", lastEvent: { type: "forfeit" } });
    expect(over.winner.id).toBe(group.teacher.user.id);
  });

  it("rejects bad game options", async () => {
    await group.student.post(`/api/channels/${group.general.id}/word-chain`).send({ language: "de" }).expect(400);
    await group.student.post(`/api/channels/${group.general.id}/word-chain`).send({ turnSeconds: 5 }).expect(400);
  });

  it("limits access to class members and lets only the host or a teacher manage the game", async () => {
    const game = (await group.student.post(`/api/channels/${group.general.id}/word-chain`).expect(201)).body.message.wordChain;
    const ana = await member("ana");
    const outsider = await user(server.app, "outsider");
    await outsider.get(`/api/word-chain/${game.id}`).expect(404);
    await outsider.post(`/api/word-chain/${game.id}/join`).expect(404);

    await ana.post(`/api/word-chain/${game.id}/join`).expect(200);
    await ana.post(`/api/word-chain/${game.id}/start`).expect(403);
    await group.teacher.post(`/api/word-chain/${game.id}/start`).expect(200);
    await ana.post(`/api/word-chain/${game.id}/finish`).expect(403);
    await outsider.post(`/api/channels/${group.general.id}/word-chain`).expect(404);
    const done = (await group.teacher.post(`/api/word-chain/${game.id}/finish`).expect(200)).body.game;
    expect(done).toMatchObject({ status: "finished", winner: null }); // tied on lives

    const dm = (await group.student.post(`/api/classes/${group.classId}/dms`).send({ userId: group.teacher.user.id }).expect(201)).body.channel;
    await group.student.post(`/api/channels/${dm.id}/word-chain`).expect(400);
  });
});
