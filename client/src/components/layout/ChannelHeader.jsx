import { CalendarDays, CircleHelp, Hash, Megaphone, Menu, Pencil, Pin, Search, Users } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { Avatar, IconButton } from "../ui/primitives.jsx";

/** Header button with a visible text label (the label hides on small screens). */
function HeaderButton({ icon: Icon, label, active, onClick }) {
  return (
    <button type="button" className={`header-btn${active ? " active" : ""}`} onClick={onClick} aria-pressed={active} title={label}>
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

export function ChannelHeader({ channel, detail }) {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const setSidebar = useStore((s) => s.setSidebar);
  const openModal = useStore((s) => s.openModal);
  const partner = useStore((s) => (channel.dmUser ? (s.details[channel.classId]?.members[channel.dmUser.id] ?? channel.dmUser) : null));
  const partnerOnline = useStore((s) => (channel.dmUser ? !!s.online[channel.dmUser.id] : false));
  const isDm = channel.kind === "dm";
  const staff = isStaffRole(detail.myRole);

  return (
    <header className="channel-header">
      <IconButton className="menu-toggle" label="Open menu" onClick={() => setSidebar(true)}>
        <Menu size={20} />
      </IconButton>
      <div className="channel-title">
        {isDm ? (
          <>
            <Avatar user={partner} size={28} online={partnerOnline} />
            <h1>{partner?.displayName}</h1>
            <span className="topic">Private · {partnerOnline ? "online now" : `@${partner?.username}`}</span>
          </>
        ) : (
          <>
            {channel.kind === "announcement" ? <Megaphone size={20} /> : <Hash size={20} />}
            <h1>{channel.name}</h1>
            {channel.kind === "announcement" && <span className="role-tag">Teachers post</span>}
            {channel.topic && (
              <span className="topic" title={channel.topic}>
                {channel.topic}
              </span>
            )}
            {staff && (
              <IconButton size="sm" label="Edit channel name or topic" onClick={() => openModal("channel", { classId: channel.classId, channel })}>
                <Pencil size={15} />
              </IconButton>
            )}
          </>
        )}
      </div>
      <div className="header-actions">
        <HeaderButton icon={Pin} label="Pinned" active={panel === "pins"} onClick={() => setPanel("pins")} />
        <HeaderButton icon={Search} label="Search" active={panel === "search"} onClick={() => setPanel("search")} />
        <HeaderButton icon={Users} label={`People (${Object.keys(detail.members).length})`} active={panel === "members"} onClick={() => setPanel("members")} />
        {!isDm && <HeaderButton icon={CalendarDays} label="Calendar" onClick={() => openModal("calendar", { classId: detail.class.id, className: detail.class.name, role: detail.myRole })} />}
        <HeaderButton icon={CircleHelp} label="Help" onClick={() => openModal("help")} />
      </div>
    </header>
  );
}
