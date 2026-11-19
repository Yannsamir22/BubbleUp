import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { startServer, user } from "./helpers.js";

let s;
beforeEach(async () => (s = await startServer()));
afterEach(async () => s.stop());

describe("auth", () => {
  it("registers, keeps a session cookie and returns the current user", async () => {
    const alice = await user(s.app, "Alice");
    expect(alice.user).toMatchObject({ username: "Alice", displayName: "Alice" });
    expect(alice.user.avatarEmoji).toBe(""); // initials by default
    expect(alice.user.avatarColor).toMatch(/^#[0-9a-f]{6}$/i);
    const me = await alice.get("/api/auth/me").expect(200);
    expect(me.body.user.id).toBe(alice.user.id);
    expect(me.body.user).not.toHaveProperty("password_hash");
  });

  it("sets an httpOnly session cookie", async () => {
    const res = await request(s.app).post("/api/auth/register").send({ username: "bob", password: "secret12" });
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    await user(s.app, "alice");
    const res = await request(s.app).post("/api/auth/register").send({ username: "ALICE", password: "password1" });
    expect(res.status).toBe(409);
  });

  it("rejects reserved names and invalid input", async () => {
    for (const body of [
      { username: "thinkmas", password: "password1" },
      { username: "ab", password: "password1" },
      { username: "has space", password: "password1" },
      { username: "valid", password: "123" },
    ]) {
      const res = await request(s.app).post("/api/auth/register").send(body);
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeTruthy();
    }
  });

  it("logs in with the right password only", async () => {
    await user(s.app, "carol", "correct-horse");
    await request(s.app).post("/api/auth/login").send({ username: "carol", password: "nope" }).expect(401);
    await request(s.app).post("/api/auth/login").send({ username: "ghost", password: "nope" }).expect(401);
    const ok = await request(s.app).post("/api/auth/login").send({ username: "CAROL", password: "correct-horse" }).expect(200);
    expect(ok.body.user.username).toBe("carol");
  });

  it("protects API routes", async () => {
    await request(s.app).get("/api/classes").expect(401);
    await request(s.app).get("/api/classes").set("Cookie", "bubbleup_session=garbage").expect(401);
    const me = await request(s.app).get("/api/auth/me").expect(200);
    expect(me.body.user).toBeNull();
  });

  it("updates the profile", async () => {
    const a = await user(s.app, "dave");
    const res = await a.patch("/api/me").send({ displayName: "Dave the Brave", avatarEmoji: "🦖", statusText: "studying" }).expect(200);
    expect(res.body.user).toMatchObject({ displayName: "Dave the Brave", avatarEmoji: "🦖", statusText: "studying" });
    await a.patch("/api/me").send({ avatarColor: "red" }).expect(400);
  });

  it("changing the password revokes old sessions", async () => {
    const a = await user(s.app, "erin", "first-pass");
    const oldCookie = a.cookie;
    await a.post("/api/me/password").send({ currentPassword: "wrong", newPassword: "second-pass" }).expect(400);
    await a.post("/api/me/password").send({ currentPassword: "first-pass", newPassword: "second-pass" }).expect(200);
    const stale = await request(s.app).get("/api/auth/me").set("Cookie", oldCookie).expect(200);
    expect(stale.body.user).toBeNull();
    await request(s.app).get("/api/classes").set("Cookie", oldCookie).expect(401);
    await a.get("/api/auth/me").expect(200); // agent got the new cookie
  });

  it("logout clears the cookie", async () => {
    const a = await user(s.app, "frank");
    const res = await a.post("/api/auth/logout").expect(204);
    expect(res.headers["set-cookie"][0]).toMatch(/bubbleup_session=;/);
  });
});
