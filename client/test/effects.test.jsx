import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CATCH_UP_MS, detectEffect, pickEffect } from "../src/lib/effects.js";
import { countdownView } from "../src/lib/countdown.js";
import { CountdownCard } from "../src/components/chat/CountdownCard.jsx";

describe("message effects", () => {
  it("spots celebrations", () => {
    expect(detectEffect("Happy birthday Ada!! 🎂")).toBe("balloons");
    expect(detectEffect("congrats on the award")).toBe("confetti");
    expect(detectEffect("Well done everyone")).toBe("confetti");
    expect(detectEffect("The maths TEST is cancelled tomorrow")).toBe("confetti");
    expect(detectEffect("exam postponed!")).toBe("confetti");
    expect(detectEffect("Congrats and happy birthday")).toBe("balloons");
  });

  it("ignores ordinary text, code and quotes", () => {
    expect(detectEffect("Is the test tomorrow?")).toBeNull();
    expect(detectEffect("the `congrats` variable")).toBeNull();
    expect(detectEffect("> happy birthday\nwho wrote this?")).toBeNull();
    expect(detectEffect("I'm not cancelling anything")).toBeNull();
  });

  it("plays the newest unseen message from the last hour, once", () => {
    const now = 1_000_000_000;
    const items = [
      { id: 1, body: "congrats", createdAt: now - CATCH_UP_MS - 1 }, // too old
      { id: 2, body: "happy birthday", createdAt: now - 60_000 },
      { id: 3, body: "well done", createdAt: now - 1000 },
      { id: "tmp-4", body: "congrats", createdAt: now }, // still sending
      { id: 5, body: "congrats", createdAt: now, deleted: true },
    ];
    expect(pickEffect(items, new Set(), now)).toEqual({ effect: "confetti", ids: [2, 3] });
    expect(pickEffect(items, new Set([3]), now)).toEqual({ effect: "balloons", ids: [2] });
    expect(pickEffect(items, new Set([2, 3]), now)).toBeNull();
  });
});

describe("countdowns", () => {
  const at = (iso) => new Date(iso);
  const meta = { title: "Chemistry exam", date: "2026-12-10", time: null };

  it("counts calendar days", () => {
    expect(countdownView(meta, at("2026-11-28T23:59:00"))).toMatchObject({ state: "ahead", days: 12, headline: "12 days until Chemistry exam", emoji: "😬" });
    expect(countdownView(meta, at("2026-12-09T00:01:00"))).toMatchObject({ state: "tomorrow", headline: "Tomorrow: Chemistry exam" });
    expect(countdownView(meta, at("2026-12-10T15:00:00"))).toMatchObject({ state: "today", headline: "Today: Chemistry exam", soon: null });
    expect(countdownView(meta, at("2026-12-11T08:00:00")).state).toBe("past");
    expect(countdownView(meta, at("2026-08-01T08:00:00")).emoji).toBe("📅");
  });

  it("counts down hours and minutes on the day when a time is set", () => {
    const withTime = { ...meta, time: "09:00" };
    expect(countdownView(withTime, at("2026-12-10T06:45:00")).soon).toBe("in 2 h 15 min");
    expect(countdownView(withTime, at("2026-12-10T08:50:00")).soon).toBe("in 10 min");
    expect(countdownView(withTime, at("2026-12-10T09:30:00")).soon).toBeNull();
  });

  it("renders the live headline", () => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    render(<CountdownCard meta={{ title: "Trip", date, time: null }} />);
    expect(screen.getByText(/5 days until Trip/)).toBeInTheDocument();
  });
});
