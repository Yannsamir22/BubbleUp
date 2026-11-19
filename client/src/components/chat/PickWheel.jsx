import { useEffect, useState } from "react";

const COLORS = ["#2349b8", "#e8a300", "#2f7d4f", "#c2410c", "#6d28d9", "#0e7490", "#be185d", "#4b5563"];
const SPIN_MS = 3800;

function slicePath(i, n, r) {
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
  const large = 1 / n > 0.5 ? 1 : 0;
  return `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
}

/**
 * The /pick wheel. Fresh picks spin and slow down onto the winner;
 * older ones (e.g. after a reload) just show the result.
 */
export function PickWheel({ meta, createdAt }) {
  const { options, winner } = meta;
  const n = options.length;
  const [fresh] = useState(() => Date.now() - createdAt < 6000);
  const slice = 360 / n;
  // Slice i's centre sits at (i + .5) * slice degrees clockwise from the top pointer.
  const target = 360 * 6 - (winner + 0.5) * slice;
  const [rotation, setRotation] = useState(fresh ? 0 : target);
  const [revealed, setRevealed] = useState(!fresh);

  useEffect(() => {
    if (!fresh) return;
    const start = requestAnimationFrame(() => setRotation(target));
    const done = setTimeout(() => setRevealed(true), SPIN_MS);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(done);
    };
  }, [fresh, target]);

  const R = 100;
  const showLabels = n <= 16;
  return (
    <div className="pick">
      <div className="pick-wheel-wrap">
        <span className="pick-pointer" aria-hidden="true" />
        <svg
          className="pick-wheel"
          viewBox="-104 -104 208 208"
          style={{ transform: `rotate(${rotation}deg)`, transition: fresh ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)` : "none" }}
          aria-hidden="true"
        >
          {options.map((label, i) => (
            <g key={i}>
              <path d={slicePath(i, n, R)} fill={COLORS[i % COLORS.length]} stroke="var(--surface)" strokeWidth="1.5" />
              {showLabels && (
                <text
                  transform={`rotate(${(i + 0.5) * slice - 90}) translate(${R * 0.58} 0)`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={n > 10 ? 8 : 10}
                  fill="#fff"
                >
                  {label.length > 12 ? `${label.slice(0, 11)}…` : label}
                </text>
              )}
            </g>
          ))}
          <circle r="12" fill="var(--surface)" stroke="var(--border-strong)" />
        </svg>
      </div>
      <p className="pick-result" aria-live="polite">
        {revealed ? (
          <>
            Picked: <strong>{options[winner]}</strong>
          </>
        ) : (
          <span className="muted">Spinning…</span>
        )}
      </p>
    </div>
  );
}
