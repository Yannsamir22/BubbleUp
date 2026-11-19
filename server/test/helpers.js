import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/app.js";

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/** Spins up an isolated server with its own temp data dir. */
export async function startServer({ fetchImpl, listen = false, ...overrides } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bubbleup-test-"));
  const config = loadConfig({ env: "test", dataDir, jwtSecret: "test-secret", disableRateLimit: true, ...overrides });
  const s = createServer(config, { logger: silent, fetchImpl });
  if (listen) await new Promise((ok) => s.server.listen(0, "127.0.0.1", ok));
  return {
    ...s,
    config,
    url: listen ? `http://127.0.0.1:${s.server.address().port}` : null,
    async stop() {
      await s.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Registers a user and returns a cookie-carrying supertest agent. */
export async function user(app, username, password = "password1") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ username, password });
  if (res.status !== 201) throw new Error(`register ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  agent.user = res.body.user;
  agent.cookie = res.headers["set-cookie"][0].split(";")[0];
  return agent;
}

/** Teacher creates a class, student joins with the student code. */
export async function classroom(app) {
  const teacher = await user(app, "teacher");
  const student = await user(app, "student");
  const created = await teacher.post("/api/classes").send({ name: "Physics" });
  const cls = created.body;
  await student.post("/api/classes/join").send({ code: cls.class.studentCode });
  const channel = (name) => cls.channels.find((c) => c.name === name);
  return { teacher, student, cls, classId: cls.class.id, general: channel("general"), announcements: channel("announcements") };
}

export function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { extraHeaders: { cookie }, transports: ["websocket"], forceNew: true });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

export function once(socket, event, predicate = () => true, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeout);
    function handler(data) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });
}

export const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
