import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classroom, startServer, user } from "./helpers.js";

let s;
let c;
beforeEach(async () => {
  s = await startServer({ maxUploadMb: 1 });
  c = await classroom(s.app);
});
afterEach(async () => s.stop());

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const upload = (agent, buffer, filename, contentType, fields = {}) => {
  let req = agent.post(`/api/classes/${c.classId}/uploads`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
  return req.attach("file", buffer, { filename, contentType });
};

describe("uploads", () => {
  it("uploads an image, attaches it and serves it to members only", async () => {
    const up = await upload(c.student, PNG, "pic.png", "image/png", { width: 1, height: 1 }).expect(201);
    expect(up.body.attachment).toMatchObject({ name: "pic.png", mime: "image/png", width: 1, height: 1 });

    // Before sending, only the uploader can fetch it.
    await c.teacher.get(up.body.attachment.url).expect(404);
    await c.student.get(up.body.attachment.url).expect(200);

    const msg = await c.student
      .post(`/api/channels/${c.general.id}/messages`)
      .send({ body: "look!", attachmentIds: [up.body.attachment.id] })
      .expect(201);
    expect(msg.body.message.attachments).toHaveLength(1);

    const file = await c.teacher.get(up.body.attachment.url).expect(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["content-disposition"]).toMatch(/^inline/);
    expect(Buffer.compare(file.body, PNG)).toBe(0);

    const outsider = await user(s.app, "outsider");
    await outsider.get(up.body.attachment.url).expect(404);
  });

  it("forces risky types (html, svg) to download", async () => {
    const up = await upload(c.student, Buffer.from("<script>alert(1)</script>"), "evil.html", "text/html").expect(201);
    await c.student.post(`/api/channels/${c.general.id}/messages`).send({ attachmentIds: [up.body.attachment.id] }).expect(201);
    const res = await c.teacher.get(up.body.attachment.url).expect(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("keeps UTF-8 file names", async () => {
    const up = await upload(c.student, Buffer.from("hi"), "résumé 📄.txt", "text/plain").expect(201);
    expect(up.body.attachment.name).toBe("résumé 📄.txt");
  });

  it("blocks executables and oversized files", async () => {
    await upload(c.student, Buffer.from("MZ"), "virus.exe", "application/octet-stream").expect(400);
    await upload(c.student, Buffer.alloc(1024 * 1024 + 10), "big.bin", "application/octet-stream").expect(413);
  });

  it("can't attach someone else's upload", async () => {
    const up = await upload(c.student, PNG, "pic.png", "image/png").expect(201);
    await c.teacher.post(`/api/channels/${c.general.id}/messages`).send({ attachmentIds: [up.body.attachment.id] }).expect(400);
  });

  it("deleting a message removes its files", async () => {
    const up = await upload(c.student, PNG, "pic.png", "image/png").expect(201);
    const msg = await c.student.post(`/api/channels/${c.general.id}/messages`).send({ attachmentIds: [up.body.attachment.id] });
    const before = fs.readdirSync(s.config.uploadDir).length;
    await c.student.delete(`/api/messages/${msg.body.message.id}`).expect(204);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(fs.readdirSync(s.config.uploadDir).length).toBe(before - 1);
    await c.student.get(up.body.attachment.url).expect(404);
  });

  it("non-members can't upload", async () => {
    const outsider = await user(s.app, "outsider");
    await outsider.post(`/api/classes/${c.classId}/uploads`).attach("file", PNG, "x.png").expect(404);
  });
});
