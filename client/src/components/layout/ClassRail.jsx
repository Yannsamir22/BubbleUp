import { memo } from "react";
import { Plus } from "lucide-react";
import { useStore } from "../../store/index.js";
import { chatPath, navigate } from "../../lib/router.js";
import { Logo } from "../ui/primitives.jsx";

function classUnread(detail) {
  if (!detail) return { unread: false, mentions: 0 };
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(detail.channels)) {
    if (c.unread > 0) unread = true;
    mentions += c.kind === "dm" ? c.unread : c.mentions;
  }
  return { unread, mentions };
}

const RailItem = memo(function RailItem({ cls, active }) {
  const detail = useStore((s) => s.details[cls.id]);
  const { unread, mentions } = classUnread(detail);
  return (
    <div className={`rail-item${active ? " active" : ""}${unread ? " has-unread" : ""}`}>
      <button
        type="button"
        className={`rail-btn${active ? " active" : ""}`}
        onClick={() => navigate(chatPath(cls.id))}
        title={cls.name}
        aria-label={`${cls.name}${mentions ? `, ${mentions} notifications` : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {cls.emoji}
      </button>
      {mentions > 0 && <span className="badge">{mentions > 99 ? "99+" : mentions}</span>}
    </div>
  );
});

export function ClassRail({ activeClassId }) {
  const classes = useStore((s) => s.classes);
  const openModal = useStore((s) => s.openModal);
  return (
    <div className="rail">
      <div className="rail-item" title="BubbleUp">
        <Logo size={36} />
      </div>
      <div className="rail-sep" />
      {classes.map((c) => (
        <RailItem key={c.id} cls={c} active={c.id === activeClassId} />
      ))}
      <div className="rail-item">
        <button type="button" className="rail-btn rail-add" onClick={() => openModal("addClass")} title="Join or create a class" aria-label="Join or create a class">
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}
