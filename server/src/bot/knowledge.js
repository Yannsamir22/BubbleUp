import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(text) {
  const s = text.replace(/\s+/g, "");
  const map = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return { map, size: Math.max(s.length - 1, 0) };
}

/** Sørensen–Dice coefficient on character bigrams (0..1). */
export function similarity(a, b) {
  if (a === b) return 1;
  const A = typeof a === "string" ? bigrams(a) : a;
  const B = typeof b === "string" ? bigrams(b) : b;
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const [bg, count] of A.map) {
    const other = B.map.get(bg);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (A.size + B.size);
}

/** Pre-indexes Q&A pairs for fast fuzzy lookup. */
export class KnowledgeBase {
  constructor(entries = []) {
    this.entries = [];
    this.add(entries);
  }

  add(entries) {
    for (const { question, answer } of entries) {
      const q = normalize(question);
      if (!q || !answer) continue;
      this.entries.push({ q, grams: bigrams(q), answer });
    }
  }

  /** Best answer above `threshold`, or null. */
  find(question, threshold = 0.55) {
    const q = normalize(question);
    if (!q) return null;
    const grams = bigrams(q);
    let best = null;
    let bestScore = threshold;
    for (const e of this.entries) {
      // Cheap length filter: Dice can't exceed 2*min/(a+b).
      const max = (2 * Math.min(grams.size, e.grams.size)) / (grams.size + e.grams.size || 1);
      if (max < bestScore) continue;
      const score = e.q === q ? 1 : similarity(grams, e.grams);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best ? { answer: best.answer, score: bestScore } : null;
  }

  static loadDefault() {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(here, "knowledge.json"), "utf8"));
      return new KnowledgeBase(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.warn("[bot] could not load knowledge.json:", err.message);
      return new KnowledgeBase();
    }
  }
}
