import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user, wait } from "./helpers.js";

let s;
let c;
beforeEach(async () => {
  s = await startServer();
  c = await classroom(s.app);
});
afterEach(async () => s.stop());

const send = (agent, channelId, body) => agent.post(`/api/channels/${channelId}/messages`).send(typeof body === "string" ? { body } : body);
const list = async (agent, channelId, q = "") => (await agent.get(`/api/channels/${channelId}/messages${q}`)).body;

describe("messages", () => {
  it("sends and lists messages in order", async () => {
    const { student, teacher, general } = c;
    await send(student, general.id, "first").expect(201);
    await send(teacher, general.id, "second").expect(201);
    const { messages } = await list(student, general.id);
    const bodies = messages.filter((m) => m.kind === "user").map((m) => m.body);
    expect(bodies).toEqual(["first", "second"]);
    expect(messages.at(-1).author.username).toBe("teacher");
  });

  it("rejects empty and oversized messages", async () => {
    await send(c.student, c.general.id, "   ").expect(400);
    await send(c.student, c.general.id, "x".repeat(4001)).expect(400);
  });

  it("paginates with before / after / around", async () => {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push((await send(c.student, c.general.id, `m${i}`)).body.message.id);
    const page1 = await list(c.student, c.general.id, "?limit=5");
    expect(page1.messages.map((m) => m.body)).toEqual(["m7", "m8", "m9", "m10", "m11"]);
    expect(page1.hasMore).toBe(true);
    const page2 = await list(c.student, c.general.id, `?limit=5&before=${page1.messages[0].id}`);
    expect(page2.messages.map((m) => m.body)).toEqual(["m2", "m3", "m4", "m5", "m6"]);
    const newer = await list(c.student, c.general.id, `?limit=3&after=${ids[3]}`);
    expect(newer.messages.map((m) => m.body)).toEqual(["m4", "m5", "m6"]);
    expect(newer.hasNewer).toBe(true);
    const around = await list(c.student, c.general.id, `?limit=4&around=${ids[6]}`);
    expect(around.messages.map((m) => m.body)).toEqual(["m5", "m6", "m7", "m8"]);
  });

  it("only staff post in announcement channels", async () => {
    await send(c.student, c.announcements.id, "can I?").expect(403);
    await send(c.teacher, c.announcements.id, "Test on Friday!").expect(201);
  });

  it("edits own messages only", async () => {
    const msg = (await send(c.student, c.general.id, "tyop")).body.message;
    await c.teacher.patch(`/api/messages/${msg.id}`).send({ body: "hacked" }).expect(403);
    const res = await c.student.patch(`/api/messages/${msg.id}`).send({ body: "typo" }).expect(200);
    expect(res.body.message).toMatchObject({ body: "typo" });
    expect(res.body.message.editedAt).toBeTruthy();
  });

  it("authors and teachers can delete; content is wiped", async () => {
    const other = await user(s.app, "other");
    await other.post("/api/classes/join").send({ code: c.cls.class.studentCode });
    const m1 = (await send(c.student, c.general.id, "secret one")).body.message;
    const m2 = (await send(c.student, c.general.id, "secret two")).body.message;
    await other.delete(`/api/messages/${m1.id}`).expect(403);
    await c.student.delete(`/api/messages/${m1.id}`).expect(204);
    await c.teacher.delete(`/api/messages/${m2.id}`).expect(204);
    const { messages } = await list(c.student, c.general.id);
    const deleted = messages.filter((m) => m.deleted);
    expect(deleted).toHaveLength(2);
    expect(deleted.every((m) => m.body === "")).toBe(true);
    expect(deleted.find((m) => m.id === m2.id).deletedByStaff).toBe(true);
    const search = await c.student.get(`/api/classes/${c.classId}/search?q=secret`);
    expect(search.body.messages).toHaveLength(0);
  });

  it("replies reference messages in the same channel", async () => {
    const parent = (await send(c.teacher, c.general.id, "Question?")).body.message;
    const reply = await send(c.student, c.general.id, { body: "Answer!", replyToId: parent.id }).expect(201);
    expect(reply.body.message.replyTo).toMatchObject({ id: parent.id, body: "Question?", author: { username: "teacher" } });
    const homework = c.cls.channels.find((ch) => ch.name === "homework");
    await send(c.student, homework.id, { body: "x", replyToId: parent.id }).expect(400);
  });

  it("toggles reactions", async () => {
    const m = (await send(c.teacher, c.general.id, "React!")).body.message;
    let r = await c.student.post(`/api/messages/${m.id}/reactions`).send({ emoji: "🎉" }).expect(200);
    expect(r.body.reactions).toEqual([{ emoji: "🎉", count: 1, userIds: [c.student.user.id] }]);
    await c.teacher.post(`/api/messages/${m.id}/reactions`).send({ emoji: "🎉" });
    r = await c.student.post(`/api/messages/${m.id}/reactions`).send({ emoji: "🎉" });
    expect(r.body.reactions).toEqual([{ emoji: "🎉", count: 1, userIds: [c.teacher.user.id] }]);
  });

  it("only teachers pin in class channels", async () => {
    const m = (await send(c.student, c.general.id, "Pin me")).body.message;
    await c.student.put(`/api/messages/${m.id}/pin`).expect(403);
    await c.teacher.put(`/api/messages/${m.id}/pin`).expect(200);
    const pins = await c.student.get(`/api/channels/${c.general.id}/pins`);
    expect(pins.body.messages.map((p) => p.id)).toEqual([m.id]);
    await c.teacher.delete(`/api/messages/${m.id}/pin`).expect(200);
  });

  it("runs polls with single choice, revoting and closing", async () => {
    const res = await send(c.teacher, c.general.id, { poll: { question: "Pizza or pasta?", options: ["Pizza", "Pasta"] } }).expect(201);
    const poll = res.body.message.poll;
    expect(poll.options).toHaveLength(2);
    const [pizza, pasta] = poll.options.map((o) => o.id);
    await c.student.post(`/api/messages/${res.body.message.id}/vote`).send({ optionIds: [pizza, pasta] }).expect(400);
    await c.student.post(`/api/messages/${res.body.message.id}/vote`).send({ optionIds: [pizza] }).expect(200);
    const changed = await c.student.post(`/api/messages/${res.body.message.id}/vote`).send({ optionIds: [pasta] }).expect(200);
    expect(changed.body.message.poll).toMatchObject({ totalVoters: 1, myVotes: [pasta] });
    expect(changed.body.message.poll.options.map((o) => o.votes)).toEqual([0, 1]);
    await c.student.post(`/api/messages/${res.body.message.id}/close-poll`).expect(403);
    await c.teacher.post(`/api/messages/${res.body.message.id}/close-poll`).expect(200);
    await c.student.post(`/api/messages/${res.body.message.id}/vote`).send({ optionIds: [pizza] }).expect(400);
  });

  it("tracks unread counts and mentions", async () => {
    await send(c.teacher, c.general.id, "hello class");
    await send(c.teacher, c.general.id, "@student please see me");
    let detail = (await c.student.get(`/api/classes/${c.classId}`)).body;
    let general = detail.channels.find((ch) => ch.name === "general");
    expect(general.unread).toBe(2);
    expect(general.mentions).toBe(1);
    await c.student.post(`/api/channels/${c.general.id}/read`).send({}).expect(200);
    detail = (await c.student.get(`/api/classes/${c.classId}`)).body;
    general = detail.channels.find((ch) => ch.name === "general");
    expect(general.unread).toBe(0);
  });

  it("searches across visible channels with prefix matching", async () => {
    await send(c.teacher, c.general.id, "Photosynthesis happens in chloroplasts");
    await send(c.student, c.general.id, "I love pizza");
    const res = await c.student.get(`/api/classes/${c.classId}/search?q=photo`).expect(200);
    expect(res.body.messages.map((m) => m.body)).toEqual(["Photosynthesis happens in chloroplasts"]);
    const weird = await c.student.get(`/api/classes/${c.classId}/search?q=${encodeURIComponent('"AND OR *')}`).expect(200);
    expect(weird.body.messages).toEqual([]);
  });
});

describe("direct messages", () => {
  it("are private to the two participants", async () => {
    const dm = await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: c.teacher.user.id }).expect(201);
    expect(dm.body.channel).toMatchObject({ kind: "dm", dmUser: { username: "teacher" } });
    const again = await c.teacher.post(`/api/classes/${c.classId}/dms`).send({ userId: c.student.user.id }).expect(200);
    expect(again.body.channel.id).toBe(dm.body.channel.id);

    await send(c.student, dm.body.channel.id, "Can I get an extension? 🥺").expect(201);
    const spy = await user(s.app, "spy");
    await spy.post("/api/classes/join").send({ code: c.cls.class.studentCode });
    await spy.get(`/api/channels/${dm.body.channel.id}/messages`).expect(404);
    await send(spy, dm.body.channel.id, "hi").expect(404);
    const search = await spy.get(`/api/classes/${c.classId}/search?q=extension`);
    expect(search.body.messages).toHaveLength(0);
    const spyDetail = await spy.get(`/api/classes/${c.classId}`);
    expect(spyDetail.body.channels.some((ch) => ch.kind === "dm")).toBe(false);
  });

  it("can't DM yourself or non-members", async () => {
    await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: c.student.user.id }).expect(400);
    const stranger = await user(s.app, "stranger");
    await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: stranger.user.id }).expect(404);
  });
});

describe("Thinkmas bot", () => {
  async function botReplyTo(messageId) {
    for (let i = 0; i < 40; i++) {
      const { messages } = await list(c.student, c.general.id);
      const reply = messages.find((m) => m.kind === "bot" && m.replyTo?.id === messageId);
      if (reply) return reply;
      await wait(25);
    }
    throw new Error("no bot reply");
  }

  it("/help is ephemeral and not stored", async () => {
    const res = await send(c.student, c.general.id, "/help").expect(200);
    expect(res.body.ephemeral.body).toMatch(/calc/);
    expect(res.body.ephemeral.body).not.toMatch(/learn/); // staff-only command hidden
    const { messages } = await list(c.student, c.general.id);
    expect(messages.some((m) => m.body === "/help")).toBe(false);
  });

  it("/calc replies publicly", async () => {
    const msg = (await send(c.student, c.general.id, "/calc (2 + 3) * 4")).body.message;
    expect((await botReplyTo(msg.id)).body).toContain("**20**");
  });

  it("/roll stays in range", async () => {
    const msg = (await send(c.student, c.general.id, "/roll 3d6")).body.message;
    const reply = await botReplyTo(msg.id);
    const total = Number(reply.body.match(/= \*\*(\d+)\*\*/)[1]);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(18);
  });

  it("/shrug rewrites the message", async () => {
    const res = await send(c.student, c.general.id, "/shrug oh well").expect(201);
    expect(res.body.message.body).toBe("oh well ¯\\_(ツ)_/¯");
  });

  it("/poll creates a poll", async () => {
    const res = await send(c.student, c.general.id, "/poll Best day? | Monday | Friday").expect(201);
    expect(res.body.message.poll.options.map((o) => o.text)).toEqual(["Monday", "Friday"]);
  });

  it("unknown commands are ephemeral; // escapes", async () => {
    const res = await send(c.student, c.general.id, "/nope").expect(200);
    expect(res.body.ephemeral.body).toMatch(/don't know/);
    const esc = await send(c.student, c.general.id, "//not a command").expect(201);
    expect(esc.body.message.body).toBe("/not a command");
  });

  it("teachers can /learn and anyone can ask via @thinkmas", async () => {
    const denied = await send(c.student, c.general.id, "/learn when is the exam :: never").expect(200);
    expect(denied.body.ephemeral.body).toMatch(/Only teachers/);
    await send(c.teacher, c.general.id, "/learn when is the exam? :: Next Monday at 9am 📅").expect(200);
    const q = (await send(c.student, c.general.id, "@thinkmas When is the exam")).body.message;
    expect((await botReplyTo(q.id)).body).toBe("Next Monday at 9am 📅");
  });

  it("/define uses the dictionary API (mocked)", async () => {
    await s.stop();
    const fetchImpl = async () => ({
      ok: true,
      json: async () => [{ word: "cat", phonetic: "/kæt/", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A small furry animal." }] }] }],
    });
    s = await startServer({ fetchImpl });
    c = await classroom(s.app);
    const msg = (await send(c.student, c.general.id, "/define cat")).body.message;
    expect((await botReplyTo(msg.id)).body).toMatch(/\*\*cat\*\*.*\n\*noun\* — A small furry animal\./s);
  });
});
