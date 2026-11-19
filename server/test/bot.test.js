import { describe, expect, it } from "vitest";
import { KnowledgeBase, normalize, similarity } from "../src/bot/knowledge.js";
import { calculate } from "../src/bot/calc.js";

describe("knowledge base", () => {
  it("normalizes text", () => {
    expect(normalize("  Héllo,  WORLD!! ")).toBe("hello world");
  });

  it("scores similarity", () => {
    expect(similarity("night", "nacht")).toBeCloseTo(0.25);
    expect(similarity("same", "same")).toBe(1);
    expect(similarity("", "x")).toBe(0);
  });

  it("finds fuzzy matches and ignores unrelated questions", () => {
    const kb = new KnowledgeBase([
      { question: "What is the capital of France?", answer: "Paris" },
      { question: "How are you?", answer: "Great!" },
    ]);
    expect(kb.find("whats the capital of france")?.answer).toBe("Paris");
    expect(kb.find("how r you")?.answer).toBe("Great!");
    expect(kb.find("explain quantum chromodynamics")).toBeNull();
  });

  it("loads the bundled knowledge.json", () => {
    const kb = KnowledgeBase.loadDefault();
    expect(kb.entries.length).toBeGreaterThan(100);
    expect(kb.find("good morning!")).not.toBeNull();
  });
});

describe("calculator sandbox", () => {
  it("evaluates maths", () => {
    expect(calculate("2 + 2 * 3")).toBe("8");
    expect(calculate("sqrt(16) + 2^3")).toBe("12");
    expect(calculate("5 cm to inch")).toMatch(/1\.9685/);
  });

  it("blocks dangerous functions", () => {
    expect(() => calculate("range(1, 1e9)")).toThrow(/disabled/);
    expect(() => calculate('import({}, {})')).toThrow();
    expect(() => calculate('evaluate("1+1")')).toThrow(/disabled/);
    expect(() => calculate("x".repeat(300))).toThrow(/too long/);
  });
});
