import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, connect, once, startServer, user, wait } from "./helpers.js";

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

const open = async (agent) => {
  const sock = await connect(s.url, agent.cookie);
  sockets.push(sock);
  return sock;
};

describe("realtime", () => {
  it("rejects connections without a session", async () => {
    await expect(connect(s.url, "bubbleup_session=bad")).rejects.toThrow(/unauthorized/);
  });

  it("pushes new messages (with clientId) to class members", async () => {
    const sock = await open(c.teacher);
    const got = once(sock, "message:new", (d) => d.message.body === "hi everyone");
    await c.student.post(`/api/channels/${c.general.id}/messages`).send({ body: "hi everyone", clientId: "tmp-1" }).expect(201);
    const evt = await got;
    expect(evt.clientId).toBe("tmp-1");
    expect(evt.message.author.username).toBe("student");
  });

  it("broadcasts presence and typing", async () => {
    const tSock = await open(c.teacher);
    const online = once(tSock, "presence", (d) => d.userId === c.student.user.id && d.online);
    const sSock = await open(c.student);
    await online;

    const typing = once(tSock, "typing", (d) => d.userId === c.student.user.id);
    sSock.emit("typing", { channelId: c.general.id });
    expect(await typing).toEqual({ channelId: c.general.id, userId: c.student.user.id });

    const offline = once(tSock, "presence", (d) => d.userId === c.student.user.id && !d.online);
    sSock.disconnect();
    await offline;
  });

  it("delivers DMs only to participants", async () => {
    const dm = (await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: c.teacher.user.id })).body.channel;
    const spy = await user(s.url, "spy");
    await spy.post("/api/classes/join").send({ code: c.cls.class.studentCode });
    const spySock = await open(spy);
    const tSock = await open(c.teacher);
    let leaked = false;
    spySock.on("message:new", (d) => d.message.channelId === dm.id && (leaked = true));
    const got = once(tSock, "message:new", (d) => d.message.channelId === dm.id);
    await c.student.post(`/api/channels/${dm.id}/messages`).send({ body: "psst" });
    await got;
    await wait(100);
    expect(leaked).toBe(false);
  });

  it("joins the new class room live and receives kick notices", async () => {
    const newbie = await user(s.url, "newbie");
    const sock = await open(newbie);
    await newbie.post("/api/classes/join").send({ code: c.cls.class.studentCode }).expect(200);
    const got = once(sock, "message:new", (d) => d.message.body === "welcome!");
    await c.teacher.post(`/api/channels/${c.general.id}/messages`).send({ body: "welcome!" });
    await got;

    const kicked = once(sock, "class:removed");
    await c.teacher.delete(`/api/classes/${c.classId}/members/${newbie.user.id}`).expect(204);
    expect(await kicked).toEqual({ classId: c.classId, reason: "kicked" });
  });

  it("poll broadcasts don't leak the voter's own selection", async () => {
    const tSock = await open(c.teacher);
    const res = await c.teacher.post(`/api/channels/${c.general.id}/messages`).send({ poll: { question: "Q?", options: ["a", "b"] } });
    const msg = res.body.message;
    const upd = once(tSock, "message:updated", (d) => d.message.id === msg.id);
    await c.student.post(`/api/messages/${msg.id}/vote`).send({ optionIds: [msg.poll.options[0].id] });
    const evt = await upd;
    expect(evt.message.poll.myVotes).toBeUndefined();
    expect(evt.message.poll.options[0].votes).toBe(1);
  });
});
