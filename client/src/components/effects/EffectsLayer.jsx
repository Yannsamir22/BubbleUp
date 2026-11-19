import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/index.js";
import { storage } from "../../lib/browser.js";
import { pickEffect } from "../../lib/effects.js";

const COLORS = ["#2349b8", "#d9482b", "#e8a300", "#2f9e5b", "#6d28d9", "#0e7490", "#be185d"];
const MAX_SEEN = 300;
const rand = (a, b) => a + Math.random() * (b - a);
const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const seenKey = (meId) => `effects-seen:${meId}`;
const loadSeen = (meId) => new Set(storage.get(seenKey(meId), []));
const saveSeen = (meId, ids) => storage.set(seenKey(meId), [...new Set(ids)].slice(-MAX_SEEN));
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Watches the open channel and plays confetti or balloons for messages that call for it:
 * live as they arrive, or once on catch-up if you open the channel within the hour.
 * Each message plays at most once per person (remembered in this browser).
 */
export function EffectsLayer() {
  const meId = useStore((s) => s.me?.id);
  const items = useStore((s) => s.messages[s.activeChannelId]?.items);
  const enabled = useStore((s) => s.settings.effects !== false);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!meId || !items || !visible) return;
    const seen = loadSeen(meId);
    const found = pickEffect(items, seen);
    if (!found) return;
    // Marked as seen even when effects are off, so turning them on later doesn't replay old ones.
    saveSeen(meId, [...seen, ...found.ids]);
    if (enabled && !reducedMotion()) setPlaying({ effect: found.effect, key: Math.max(...found.ids) });
  }, [meId, items, visible, enabled]);

  if (!playing) return null;
  return <EffectCanvas key={playing.key} effect={playing.effect} onDone={() => setPlaying(null)} />;
}

function confetti(w, h) {
  return Array.from({ length: Math.min(220, Math.round(w / 6)) }, () => ({
    x: rand(0, w),
    y: rand(-h * 0.6, -10),
    vx: rand(-1.5, 1.5),
    vy: rand(2, 5),
    size: rand(6, 11),
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.2, 0.2),
    wobble: rand(0, Math.PI * 2),
    round: Math.random() < 0.3,
    color: pickColor(),
  }));
}

function balloons(w, h) {
  return Array.from({ length: Math.max(8, Math.min(22, Math.round(w / 70))) }, () => {
    const r = rand(20, 34);
    return { x: rand(r, w - r), y: h + rand(r * 2, h * 0.7), r, vy: rand(1.6, 3), phase: rand(0, Math.PI * 2), color: pickColor() };
  });
}

function drawConfetti(ctx, p, dt) {
  p.vy = Math.min(p.vy + 0.05 * dt, 6);
  p.wobble += 0.08 * dt;
  p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
  p.y += p.vy * dt;
  p.rot += p.vr * dt;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  if (p.round) {
    ctx.beginPath();
    ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  }
  ctx.restore();
}

function drawBalloon(ctx, b, dt, t) {
  b.y -= b.vy * dt;
  const x = b.x + Math.sin(t / 700 + b.phase) * 14;
  const ry = b.r * 1.2;
  // string
  ctx.strokeStyle = "rgba(90, 90, 90, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, b.y + ry);
  for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(x + (i % 2 ? 6 : -6), b.y + ry + i * 14 - 7, x, b.y + ry + i * 14);
  ctx.stroke();
  // balloon + knot
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.ellipse(x, b.y, b.r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, b.y + ry - 2);
  ctx.lineTo(x - 5, b.y + ry + 6);
  ctx.lineTo(x + 5, b.y + ry + 6);
  ctx.fill();
  // shine
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.ellipse(x - b.r * 0.35, b.y - ry * 0.4, b.r * 0.18, ry * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A full-screen canvas that plays one effect and then removes itself. Clicks pass through it. */
function EffectCanvas({ effect, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) {
      onDone();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const duration = effect === "balloons" ? 7000 : 4500;
    const parts = effect === "balloons" ? balloons(w, h) : confetti(w, h);
    const start = performance.now();
    let last = start;
    let frame;
    const tick = (t) => {
      const dt = Math.min((t - last) / 16.67, 3); // frame-rate independent, no huge jumps after a stall
      last = t;
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, (duration - elapsed) / 800)); // fade out at the end
      for (const p of parts) (effect === "balloons" ? drawBalloon(ctx, p, dt, t) : drawConfetti(ctx, p, dt));
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else onDone();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [effect]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} className="effects-canvas" aria-hidden="true" />;
}
