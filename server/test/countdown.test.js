import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer } from "./helpers.js";
import { countdownBody, localDate, parseCountdown } from "../src/lib/countdown.js";

describe("parseCountdown", () => {
  const now = new Date(2026, 10, 19, 12, 0); // 19 Nov 2026

  it("reads a name and a date in either order, with an optional time", () => {
    expect(parseCountdown("Chemistry exam 2026-12-10", now)).toEqual({ title: "Chemistry exam", date: "2026-12-10", time: null });
    expect(parseCountdown("2026-12-10 9:05 - Maths test", now)).toEqual({ title: "Maths test", date: "2026-12-10", time: "09:05" });
    expect(parseCountdown("Today's quiz 2026-11-19", now)).toMatchObject({ date: "2026-11-19" });
  });

  it("explains what's wrong", () => {
    expect(parseCountdown("Exam next week", now).error).toMatch(/Usage/);
    expect(parseCountdown("Exam 2026-02-30", now).error).toMatch(/isn't a real date/);
    expect(parseCountdown("Exam 2026-11-18", now).error).toMatch(/already passed/);
    expect(parseCountdown("Exam 2030-01-01", now).error).toMatch(/2 years/);
    expect(parseCountdown("2026-12-10", now).error).toMatch(/name/);
    expect(parseCountdown("Exam 2026-12-10 25:00", now).error).toMatch(/24-hour/);
  });

  it("writes a readable body", () => {
    expect(countdownBody({ title: "Exam", date: "2026-12-10", time: null })).toBe("⏳ Countdown: Exam — 10 Dec 2026");
    expect(countdownBody({ title: "Exam", date: "2026-12-10", time: "09:00" })).toBe("⏳ Countdown: Exam — 10 Dec 2026 at 09:00");
  });
});

describe("/countdown", () => {
  let s;
  let c;
  beforeEach(async () => {
    s = await startServer();
    c = await classroom(s.app);
  });
  afterEach(() => s.stop());

  const future = () => {
    const d = new Date();
    d.setDate(d.getDate() + 12);
    return localDate(d);
  };
  const send = (agent, channelId, body) => agent.post(`/api/channels/${channelId}/messages`).send({ body });

  it("a teacher's countdown is pinned; a student's is posted but not pinned", async () => {
    const t = await send(c.teacher, c.general.id, `/countdown Chemistry exam ${future()}`).expect(201);
    expect(t.body.message).toMatchObject({ pinned: true, meta: { type: "countdown", title: "Chemistry exam", date: future(), time: null } });
    expect(t.body.message.body).toMatch(/^⏳ Countdown: Chemistry exam/);

    const st = await send(c.student, c.general.id, `/countdown Party ${future()}`).expect(201);
    expect(st.body.message).toMatchObject({ pinned: false, meta: { type: "countdown", title: "Party" } });

    const pins = (await c.student.get(`/api/channels/${c.general.id}/pins`)).body.messages;
    expect(pins.map((m) => m.id)).toEqual([t.body.message.id]);
  });

  it("pins in private chats, refuses bad input, respects announcement channels", async () => {
    const dm = (await c.student.post(`/api/classes/${c.classId}/dms`).send({ userId: c.teacher.user.id })).body.channel;
    const res = await send(c.student, dm.id, `/countdown Our project ${future()}`).expect(201);
    expect(res.body.message.pinned).toBe(true);

    const bad = await send(c.student, c.general.id, "/countdown Exam someday").expect(200);
    expect(bad.body.ephemeral.body).toMatch(/Usage/);
    await send(c.student, c.announcements.id, `/countdown Exam ${future()}`).expect(403);
  });

  it("unpins countdowns the day after their date", async () => {
    const date = future();
    const res = await send(c.teacher, c.general.id, `/countdown Exam ${date}`).expect(201);
    expect(s.unpinFinishedCountdowns(date)).toBe(0); // still pinned on the day itself
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    expect(s.unpinFinishedCountdowns(localDate(next))).toBe(1);
    const pins = (await c.teacher.get(`/api/channels/${c.general.id}/pins`)).body.messages;
    expect(pins.find((m) => m.id === res.body.message.id)).toBeUndefined();
  });
});
