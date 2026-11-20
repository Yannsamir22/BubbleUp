import { useStore } from "../../store/index.js";
import { typingText } from "../../lib/format.js";

const NONE = {};
const FLOATING_BUBBLES = 18;

export function TypingIndicator({ channelId, members }) {
  const typing = useStore((s) => s.typing[channelId] ?? NONE);
  const now = Date.now();
  const typers = Object.entries(typing)
    .filter(([, exp]) => exp > now)
    .map(([id]) => ({ id, name: Number(id) === 0 ? "Thinkmas" : members[id]?.displayName }))
    .filter((typer) => typer.name);
  if (typers.length === 0) return null;
  const names = typers.map((typer) => typer.name);
  const label = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more are typing` : typingText(names);

  return (
    <>
      <div className="typing-float-layer" aria-hidden="true">
        {Array.from({ length: FLOATING_BUBBLES }, (_, index) => (
          <span
            className="typing-orb"
            key={index}
            style={{
              "--bubble-delay": `${index * 0.1}s`,
              "--bubble-x": `${5 + ((index * 47) % 90)}%`,
              "--rise-distance": `${18 + ((index * 11) % 18)}vh`,
            }}
          >
            <i className="typing-spark" />
            <i className="typing-spark" />
            <i className="typing-spark" />
            <i className="typing-spark" />
          </span>
        ))}
      </div>
      <div className="typing-caption" role="status" aria-live="polite">
        <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{label}</span>
      </div>
    </>
  );
}
