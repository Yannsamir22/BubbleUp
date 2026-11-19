import { describe, expect, it } from "vitest";
import { fileKind, formatBytes, formatDuration, shouldGroup, typingText } from "../src/lib/format.js";
import { parseRoute } from "../src/lib/router.js";

const msg = (id, authorId, createdAt, extra = {}) => ({ id, kind: "user", author: { id: authorId }, createdAt, ...extra });

describe("format helpers", () => {
  it("formats sizes and durations", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(NaN)).toBe("0:00");
  });

  it("groups consecutive messages by the same author within 5 minutes", () => {
    const t = new Date(2026, 0, 1, 10, 0).getTime();
    expect(shouldGroup(msg(1, 7, t), msg(2, 7, t + 60_000))).toBe(true);
    expect(shouldGroup(msg(1, 7, t), msg(2, 8, t + 60_000))).toBe(false);
    expect(shouldGroup(msg(1, 7, t), msg(2, 7, t + 6 * 60_000))).toBe(false);
    expect(shouldGroup(msg(1, 7, t), msg(2, 7, t + 1000, { replyTo: { id: 1 } }))).toBe(false);
    expect(shouldGroup(null, msg(2, 7, t))).toBe(false);
  });

  it("describes who's typing", () => {
    expect(typingText(["Ana"])).toBe("Ana is typing");
    expect(typingText(["Ana", "Ben"])).toBe("Ana and Ben are typing");
    expect(typingText(["a", "b", "c", "d"])).toMatch(/Several/);
  });

  it("classifies files", () => {
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("audio/webm")).toBe("audio");
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("application/zip")).toBe("file");
  });

  it("parses routes", () => {
    expect(parseRoute("/c/3/14")).toEqual({ name: "chat", classId: 3, channelId: 14 });
    expect(parseRoute("/c/3")).toEqual({ name: "chat", classId: 3, channelId: null });
    expect(parseRoute("/welcome")).toEqual({ name: "welcome" });
    expect(parseRoute("/whatever")).toEqual({ name: "home" });
  });
});
