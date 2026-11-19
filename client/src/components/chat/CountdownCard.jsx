import { useEffect, useState } from "react";
import { countdownView } from "../../lib/countdown.js";

/** A live countdown inside a message. Re-renders every 30 seconds so it stays right across midnight. */
export function CountdownCard({ meta }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const v = countdownView(meta, now);

  return (
    <div className={`countdown-card ${v.state}`}>
      <div className="countdown-tile" aria-hidden="true">
        {v.state === "ahead" ? (
          <>
            <strong>{v.days}</strong>
            <span>days</span>
          </>
        ) : (
          <strong className="countdown-emoji">{v.emoji}</strong>
        )}
      </div>
      <div className="countdown-text">
        <strong>
          {v.headline} {v.state === "ahead" && v.emoji}
        </strong>
        <span>
          {v.when}
          {v.soon && <b> · {v.soon}</b>}
        </span>
      </div>
    </div>
  );
}
