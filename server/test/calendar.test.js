import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user } from "./helpers.js";

let s;
beforeEach(async () => {
  s = await startServer();
});
afterEach(async () => s.stop());

describe("class calendar", () => {
  it("lets teachers publish events for members and restricts creation and deletion", async () => {
    const { teacher, student, classId } = await classroom(s.app);
    const startsAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const created = await teacher
      .post(`/api/classes/${classId}/events`)
      .send({ title: "Physics test", description: "Chapters 1–3", startsAt })
      .expect(201);

    expect(created.body.events).toHaveLength(1);
    expect(created.body.events[0]).toMatchObject({
      title: "Physics test",
      description: "Chapters 1–3",
      startsAt,
      createdBy: { id: teacher.user.id },
    });
    expect((await student.get(`/api/classes/${classId}/events`).expect(200)).body.events).toHaveLength(1);
    await student.post(`/api/classes/${classId}/events`).send({ title: "Not allowed", startsAt }).expect(403);
    await student.delete(`/api/classes/${classId}/events/${created.body.events[0].id}`).expect(403);
    await teacher.delete(`/api/classes/${classId}/events/${created.body.events[0].id}`).expect(200);
    expect((await student.get(`/api/classes/${classId}/events`).expect(200)).body.events).toEqual([]);
  });

  it("validates event times and dispatches each reminder exactly once", async () => {
    const { teacher, classId } = await classroom(s.app);
    await teacher.post(`/api/classes/${classId}/events`).send({ title: "Past", startsAt: Date.now() - 1 }).expect(400);

    const startsAt = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const created = await teacher.post(`/api/classes/${classId}/events`).send({ title: "Due soon", startsAt }).expect(201);
    const eventId = created.body.events[0].id;

    expect(s.services.calendar.dispatchReminders(startsAt - 24 * 60 * 60 * 1000 - 1)).toEqual([]);
    expect(s.services.calendar.dispatchReminders(startsAt - 24 * 60 * 60 * 1000).map((event) => event.id)).toEqual([eventId]);
    expect(s.services.calendar.dispatchReminders(startsAt - 24 * 60 * 60 * 1000)).toEqual([]);
  });

  it("does not expose events outside a member's class", async () => {
    const { classId } = await classroom(s.app);
    const outsider = await user(s.app, "outsider");
    await outsider.get(`/api/classes/${classId}/events`).expect(404);
  });
});
