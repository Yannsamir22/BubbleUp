import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user, wait } from "./helpers.js";
import { isoWeek } from "../src/services/awards.js";

let s;
let c;
beforeEach(async () => {
  s = await startServer();
  c = await classroom(s.app);
});
afterEach(async () => s.stop());

const send = (agent, channelId, body) => agent.post(`/api/channels/${channelId}/messages`).send({ body });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function botReplyTo(agent, channelId, messageId) {
  for (let i = 0; i < 40; i++) {
    const { messages } = (await agent.get(`/api/channels/${channelId}/messages`)).body;
    const reply = messages.find((m) => m.kind === "bot" && m.replyTo?.id === messageId);
    if (reply) return reply;
    await wait(25);
  }
  throw new Error("no bot reply");
}

describe("chess", () => {
  async function startGame() {
    const res = await c.student.post(`/api/channels/${c.general.id}/chess`).send({ opponentId: c.teacher.user.id }).expect(201);
    const game = res.body.message.chess;
    expect(res.body.message.body).toContain("@teacher");
    expect(game).toMatchObject({ status: "pending", challengerId: c.student.user.id });
    return game;
  }
  const player = (game, color) => (game[color].id === c.student.user.id ? c.student : c.teacher);

  it("challenge → accept → legal moves only, in turn", async () => {
    const game = await startGame();
    await c.student.post(`/api/chess/${game.id}/accept`).expect(403); // only the invitee answers
    const accepted = await c.teacher.post(`/api/chess/${game.id}/accept`).expect(200);
    expect(accepted.body.game.status).toBe("active");

    const white = player(game, "white");
    const black = player(game, "black");
    await black.post(`/api/chess/${game.id}/move`).send({ from: "e7", to: "e5" }).expect(400); // not black's turn
    await white.post(`/api/chess/${game.id}/move`).send({ from: "e2", to: "e5" }).expect(400); // illegal
    const moved = await white.post(`/api/chess/${game.id}/move`).send({ from: "e2", to: "e4" }).expect(200);
    expect(moved.body.game).toMatchObject({ moves: ["e4"], turn: "black", lastMove: { from: "e2", to: "e4" } });

    // spectators can watch but not move
    const watcher = await user(s.app, "watcher");
    await watcher.post("/api/classes/join").send({ code: c.cls.class.studentCode });
    await watcher.get(`/api/chess/${game.id}`).expect(200);
    await watcher.post(`/api/chess/${game.id}/move`).send({ from: "e7", to: "e5" }).expect(403);
  });

  it("detects checkmate (fool's mate)", async () => {
    const game = await startGame();
    await c.teacher.post(`/api/chess/${game.id}/accept`);
    const white = player(game, "white");
    const black = player(game, "black");
    for (const [p, from, to] of [[white, "f2", "f3"], [black, "e7", "e5"], [white, "g2", "g4"], [black, "d8", "h4"]]) {
      await p.post(`/api/chess/${game.id}/move`).send({ from, to }).expect(200);
    }
    const final = (await c.teacher.get(`/api/chess/${game.id}`)).body.game;
    expect(final).toMatchObject({ status: "finished", result: "black", reason: "checkmate" });
    await white.post(`/api/chess/${game.id}/move`).send({ from: "a2", to: "a3" }).expect(400);
  });

  it("resign, decline and cancel", async () => {
    const g1 = await startGame();
    await c.teacher.post(`/api/chess/${g1.id}/decline`).expect(200);
    await c.teacher.post(`/api/chess/${g1.id}/accept`).expect(400);

    const g2 = await startGame();
    await c.student.post(`/api/chess/${g2.id}/cancel`).expect(200);

    const g3 = await startGame();
    await c.teacher.post(`/api/chess/${g3.id}/accept`);
    const res = await c.student.post(`/api/chess/${g3.id}/resign`).expect(200);
    expect(res.body.game.result).toBe(g3.white.id === c.student.user.id ? "black" : "white");
  });

  it("/chess @name creates a challenge; strangers and self are rejected", async () => {
    const res = await send(c.student, c.general.id, "/chess @teacher").expect(201);
    expect(res.body.message.chess.status).toBe("pending");
    const unknown = await send(c.student, c.general.id, "/chess @nobody_here").expect(200);
    expect(unknown.body.ephemeral.body).toMatch(/Nobody/);
    await c.student.post(`/api/channels/${c.general.id}/chess`).send({ opponentId: c.student.user.id }).expect(400);
    const stranger = await user(s.app, "stranger");
    await c.student.post(`/api/channels/${c.general.id}/chess`).send({ opponentId: stranger.user.id }).expect(404);
  });
});

describe("random picker", () => {
  it("/pick with options picks one of them and returns wheel data", async () => {
    const msg = (await send(c.student, c.general.id, "/pick pizza, pasta, rice")).body.message;
    const reply = await botReplyTo(c.student, c.general.id, msg.id);
    expect(reply.meta.type).toBe("pick");
    expect(reply.meta.options).toEqual(["pizza", "pasta", "rice"]);
    expect(reply.body).toContain(reply.meta.options[reply.meta.winner]);
  });

  it("/pick without options uses the class's students", async () => {
    const s2 = await user(s.app, "second");
    await s2.post("/api/classes/join").send({ code: c.cls.class.studentCode });
    const msg = (await send(c.teacher, c.general.id, "/pick")).body.message;
    const reply = await botReplyTo(c.teacher, c.general.id, msg.id);
    expect(reply.meta.options.sort()).toEqual(["second", "student"]);
  });

  it("explains itself when there aren't enough options", async () => {
    const res = await send(c.teacher, c.general.id, "/pick onlyone").expect(200);
    expect(res.body.ephemeral.body).toMatch(/at least two/);
  });
});

describe("class emoji", () => {
  const add = (agent, name, buf = PNG, type = "image/png") =>
    agent.post(`/api/classes/${c.classId}/emojis`).field("name", name).attach("file", buf, { filename: "e.png", contentType: type });

  it("members add emoji, everyone sees them, only members can load the image", async () => {
    const res = await add(c.student, ":Teacher_Mug:").expect(201);
    expect(res.body.emoji.name).toBe("teacher_mug");
    const detail = await c.teacher.get(`/api/classes/${c.classId}`);
    expect(detail.body.emojis.map((e) => e.name)).toEqual(["teacher_mug"]);
    const img = await c.teacher.get(res.body.emoji.url).expect(200);
    expect(img.headers["content-type"]).toBe("image/png");
    const outsider = await user(s.app, "outsider");
    await outsider.get(res.body.emoji.url).expect(404);
  });

  it("validates name, type and duplicates", async () => {
    await add(c.student, "x").expect(400);
    await add(c.student, "ok_name", Buffer.from("<svg/>"), "image/svg+xml").expect(400);
    await add(c.student, "dup").expect(201);
    await add(c.teacher, "dup").expect(409);
  });

  it("only the creator or a teacher can remove an emoji", async () => {
    await add(c.teacher, "teachers_one").expect(201);
    await c.student.delete(`/api/classes/${c.classId}/emojis/teachers_one`).expect(403);
    await add(c.student, "mine").expect(201);
    await c.student.delete(`/api/classes/${c.classId}/emojis/mine`).expect(204);
    await c.teacher.delete(`/api/classes/${c.classId}/emojis/teachers_one`).expect(204);
  });

  it("class emoji can be used as reactions", async () => {
    await add(c.student, "party_parrot").expect(201);
    const m = (await send(c.teacher, c.general.id, "Test is cancelled")).body.message;
    const r = await c.student.post(`/api/messages/${m.id}/reactions`).send({ emoji: ":party_parrot:" }).expect(200);
    expect(r.body.reactions[0].emoji).toBe(":party_parrot:");
  });
});

describe("weekly awards", () => {
  it("computes winners from the week's activity (ignoring self-reactions and DMs)", async () => {
    const homework = c.cls.channels.find((ch) => ch.name === "homework");
    const answers = [];
    for (let i = 0; i < 3; i++) answers.push((await send(c.student, homework.id, `Answer ${i}`)).body.message);
    await send(c.teacher, c.general.id, "Any questions?");
    await send(c.teacher, c.general.id, "Really, any questions?");
    for (const a of answers) await c.teacher.post(`/api/messages/${a.id}/reactions`).send({ emoji: "👍" });
    await c.student.post(`/api/messages/${answers[0].id}/reactions`).send({ emoji: "😂" }); // self-reaction

    const winners = s.services.awards.compute(c.classId);
    const byKey = Object.fromEntries(winners.map((w) => [w.key, w]));
    expect(byKey.chatterbox).toMatchObject({ username: "student", score: 3 });
    expect(byKey.helpful).toMatchObject({ username: "student", score: 3 });
    expect(byKey.emoji).toMatchObject({ username: "teacher", score: 3 });
    expect(byKey.questions).toMatchObject({ username: "teacher", score: 2 });
  });

  it("/awards: students get a private preview, teachers post publicly", async () => {
    const preview = await send(c.student, c.general.id, "/awards").expect(200);
    expect(preview.body.ephemeral.body).toMatch(/No awards yet|so far/);
    for (let i = 0; i < 2; i++) await send(c.student, c.general.id, `msg ${i}`);
    const posted = await send(c.teacher, c.general.id, "/awards").expect(201);
    const reply = await botReplyTo(c.teacher, c.general.id, posted.body.message.id);
    expect(reply.body).toMatch(/Chatterbox.*@student/);
  });

  it("the Friday job posts once per week", async () => {
    for (let i = 0; i < 2; i++) await send(c.student, c.general.id, `msg ${i}`);
    const friday = new Date();
    friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7));
    friday.setHours(23, 59, 0, 0);
    const monday = new Date(friday.getTime() - 4 * 86_400_000);
    expect(s.postWeeklyAwards(monday)).toBe(0); // wrong day
    expect(s.postWeeklyAwards(friday)).toBe(1);
    expect(s.postWeeklyAwards(friday)).toBe(0); // already done this week
  });

  it("formats ISO weeks", () => {
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe("2026-W01");
    expect(isoWeek(new Date(2026, 11, 31).getTime())).toBe("2026-W53");
    expect(isoWeek(new Date(2025, 11, 29).getTime())).toBe("2026-W01");
  });
});
