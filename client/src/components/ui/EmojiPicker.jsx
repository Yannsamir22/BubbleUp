import { useState } from "react";
import { Plus } from "lucide-react";
import { EMOJI_GROUPS } from "../../lib/fun.js";
import { useStore } from "../../store/index.js";
import { Popover } from "./primitives.jsx";

const NONE = [];

/** Emoji picker with the standard sets plus the current class's own emoji. */
export function EmojiPicker({ anchor, onPick, onClose, align }) {
  const classEmojis = useStore((s) => s.details[s.activeClassId]?.emojis ?? NONE);
  const classId = useStore((s) => s.activeClassId);
  const groups = ["Class", ...Object.keys(EMOJI_GROUPS)];
  const [tab, setTab] = useState(classEmojis.length ? "Class" : "Smileys");

  return (
    <Popover anchor={anchor} onClose={onClose} align={align} className="menu emoji-picker">
      <div className="emoji-tabs" role="tablist">
        {groups.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={tab === g} className={tab === g ? "active" : ""} onClick={() => setTab(g)}>
            {g}
          </button>
        ))}
      </div>
      {tab === "Class" ? (
        <div className="emoji-grid">
          {classEmojis.map((e) => (
            <button key={e.id} type="button" onClick={() => onPick(`:${e.name}:`)} aria-label={`:${e.name}:`} title={`:${e.name}:`}>
              <img src={e.url} alt="" className="custom-emoji" />
            </button>
          ))}
          <button
            type="button"
            className="emoji-add"
            title="Add a class emoji"
            aria-label="Add a class emoji"
            onClick={() => {
              onClose();
              useStore.getState().openModal("classEmoji", { classId });
            }}
          >
            <Plus size={18} />
          </button>
          {classEmojis.length === 0 && <p className="emoji-empty">Your class has no custom emoji yet. Add a photo or drawing with the + button.</p>}
        </div>
      ) : (
        <div className="emoji-grid">
          {EMOJI_GROUPS[tab].map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
