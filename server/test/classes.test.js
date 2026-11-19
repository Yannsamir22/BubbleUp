import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user } from "./helpers.js";

let s;
beforeEach(async () => (s = await startServer()));
afterEach(async () => s.stop());

describe("classes", () => {
  it("creates a class with default channels and the creator as owner", async () => {
    const t = await user(s.app, "teach");
    const res = await t.post("/api/classes").send({ name: "Biology", emoji: "🧬" }).expect(201);
    expect(res.body.myRole).toBe("owner");
    expect(res.body.class).toMatchObject({ name: "Biology", emoji: "🧬" });
    expect(res.body.class.studentCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.channels.map((c) => c.name)).toEqual(["general", "announcements", "homework", "random"]);
    expect(res.body.channels.find((c) => c.name === "announcements").kind).toBe("announcement");
  });

  it("joins as student or teacher depending on the code, and hides codes from students", async () => {
    const { cls, student, classId } = await classroom(s.app);
    const st = await student.get(`/api/classes/${classId}`).expect(200);
    expect(st.body.myRole).toBe("student");
    expect(st.body.class.studentCode).toBeUndefined();
    expect(st.body.class.teacherCode).toBeUndefined();

    const t2 = await user(s.app, "teacher2");
    const joined = await t2.post("/api/classes/join").send({ code: cls.class.teacherCode.toLowerCase() }).expect(200);
    expect(joined.body.myRole).toBe("teacher");
    expect(joined.body.class.studentCode).toBeTruthy();

    // A student given the teacher code later is promoted.
    const promoted = await student.post("/api/classes/join").send({ code: cls.class.teacherCode }).expect(200);
    expect(promoted.body).toMatchObject({ myRole: "teacher", promoted: true });
  });

  it("rejects unknown codes and hides classes from non-members", async () => {
    const { classId } = await classroom(s.app);
    const outsider = await user(s.app, "outsider");
    await outsider.post("/api/classes/join").send({ code: "ZZZZZZ" }).expect(404);
    await outsider.get(`/api/classes/${classId}`).expect(404);
  });

  it("posts a welcome system message in #general when someone joins", async () => {
    const { teacher, general } = await classroom(s.app);
    const res = await teacher.get(`/api/channels/${general.id}/messages`).expect(200);
    const sys = res.body.messages.find((m) => m.kind === "system");
    expect(sys.body).toMatch(/student.*joined/);
  });

  it("new members start with zero unread", async () => {
    const { teacher, general, cls } = await classroom(s.app);
    await teacher.post(`/api/channels/${general.id}/messages`).send({ body: "old news" });
    const late = await user(s.app, "latecomer");
    const res = await late.post("/api/classes/join").send({ code: cls.class.studentCode }).expect(200);
    expect(res.body.channels.find((c) => c.name === "general").unread).toBe(0);
  });

  it("only staff can create/edit channels; #general is protected", async () => {
    const { teacher, student, classId, general } = await classroom(s.app);
    await student.post(`/api/classes/${classId}/channels`).send({ name: "secret" }).expect(403);
    const ch = await teacher.post(`/api/classes/${classId}/channels`).send({ name: "Lab Reports!", topic: "📎" }).expect(201);
    expect(ch.body.channel.name).toBe("lab-reports");
    await teacher.post(`/api/classes/${classId}/channels`).send({ name: "lab reports" }).expect(409);
    await teacher.patch(`/api/channels/${ch.body.channel.id}`).send({ topic: "updated" }).expect(200);
    await teacher.delete(`/api/channels/${general.id}`).expect(400);
    await teacher.delete(`/api/channels/${ch.body.channel.id}`).expect(204);
  });

  it("owner manages roles; teachers moderate students only", async () => {
    const { teacher, student, cls, classId } = await classroom(s.app);
    const t2 = await user(s.app, "assistant");
    await t2.post("/api/classes/join").send({ code: cls.class.teacherCode });

    // teacher (non-owner) cannot change roles, cannot kick another teacher
    await t2.patch(`/api/classes/${classId}/members/${student.user.id}`).send({ role: "teacher" }).expect(403);
    await t2.delete(`/api/classes/${classId}/members/${teacher.user.id}`).expect(403);

    // mute: student can't post, teacher can unmute
    await t2.post(`/api/classes/${classId}/members/${student.user.id}/mute`).send({ minutes: 10 }).expect(200);
    const general = cls.channels.find((c) => c.name === "general");
    const muted = await student.post(`/api/channels/${general.id}/messages`).send({ body: "hi" }).expect(403);
    expect(muted.body.error).toMatch(/muted/);
    await t2.post(`/api/classes/${classId}/members/${student.user.id}/mute`).send({ minutes: 0 }).expect(200);
    await student.post(`/api/channels/${general.id}/messages`).send({ body: "hi" }).expect(201);

    // kick
    await t2.delete(`/api/classes/${classId}/members/${student.user.id}`).expect(204);
    await student.get(`/api/classes/${classId}`).expect(404);
  });

  it("transfers ownership", async () => {
    const { teacher, cls, classId } = await classroom(s.app);
    const t2 = await user(s.app, "heir");
    await t2.post("/api/classes/join").send({ code: cls.class.teacherCode });
    await teacher.post(`/api/classes/${classId}/leave`).expect(400); // owner can't just leave
    await teacher.patch(`/api/classes/${classId}/members/${t2.user.id}`).send({ role: "owner" }).expect(200);
    const res = await t2.get(`/api/classes/${classId}`);
    expect(res.body.myRole).toBe("owner");
    expect(res.body.class.ownerId).toBe(t2.user.id);
    await teacher.post(`/api/classes/${classId}/leave`).expect(204);
  });

  it("owner can reset codes and delete the class", async () => {
    const { teacher, student, cls, classId } = await classroom(s.app);
    await student.post(`/api/classes/${classId}/codes`).expect(403);
    const res = await teacher.post(`/api/classes/${classId}/codes`).expect(200);
    expect(res.body.class.studentCode).not.toBe(cls.class.studentCode);
    await student.delete(`/api/classes/${classId}`).expect(403);
    await teacher.delete(`/api/classes/${classId}`).expect(204);
    const list = await teacher.get("/api/classes");
    expect(list.body.classes).toHaveLength(0);
  });
});
