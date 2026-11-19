import { useStore } from "../../store/index.js";
import { typingText } from "../../lib/format.js";

const NONE = {};

export function TypingIndicator({ channelId, members }) {
  const typing = useStore((s) => s.typing[channelId] ?? NONE);
  const now = Date.now();
  const names = Object.entries(typing)
    .filter(([, exp]) => exp > now)
    .map(([id]) => (Number(id) === 0 ? "Thinkmas" : members[id]?.displayName))
    .filter(Boolean);
  return (
    <div className="typing" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {typingText(names)}…
        </>
      )}
    </div>
  );
}
