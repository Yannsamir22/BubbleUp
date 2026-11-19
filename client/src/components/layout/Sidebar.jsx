import { memo, useMemo, useState } from "react";
import { ChevronDown, Hash, Megaphone, Plus, Settings, Smile, Trash2, UserPlus, DoorOpen } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { chatPath, navigate } from "../../lib/router.js";
import { Avatar, IconButton, MenuItem, Popover } from "../ui/primitives.jsx";
import { GettingStarted } from "../onboarding/GettingStarted.jsx";

const ChannelItem = memo(function ChannelItem({ channel, active, classId }) {
  const Icon = channel.kind === "announcement" ? Megaphone : Hash;
  const unread = channel.unread > 0 && !active;
  return (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}${unread ? " unread" : ""}`}
      onClick={() => navigate(chatPath(classId, channel.id))}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={17} />
      <span className="label">{channel.name}</span>
      {!active && channel.mentions > 0 ? <span className="badge">{channel.mentions}</span> : unread && <span className="nav-dot" />}
    </button>
  );
});

const DmItem = memo(function DmItem({ channel, active, classId }) {
  const online = useStore((s) => !!s.online[channel.dmUser?.id]);
  const member = useStore((s) => s.details[classId]?.members[channel.dmUser?.id]);
  const user = member ?? channel.dmUser;
  const unread = channel.unread > 0 && !active;
  return (
    <button
      type="button"
      className={`nav-item${active ? " active" : ""}${unread ? " unread" : ""}`}
      onClick={() => navigate(chatPath(classId, channel.id))}
      aria-current={active ? "page" : undefined}
    >
      <Avatar user={user} size={24} online={online} />
      <span className="label">{user?.displayName ?? "Unknown"}</span>
      {unread && <span className="badge">{channel.unread}</span>}
    </button>
  );
});

export function Sidebar({ detail, activeChannelId }) {
  const [menu, setMenu] = useState(null);
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const staff = isStaffRole(detail.myRole);
  const classId = detail.class.id;

  const { channels, dms } = useMemo(() => {
    const all = Object.values(detail.channels);
    return {
      channels: all.filter((c) => c.kind !== "dm").sort((a, b) => a.position - b.position || a.id - b.id),
      dms: all.filter((c) => c.kind === "dm").sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)),
    };
  }, [detail.channels]);

  const run = (fn) => () => {
    setMenu(null);
    fn();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button type="button" className="class-switch" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())} aria-haspopup="menu">
          <span aria-hidden="true">{detail.class.emoji}</span>
          <span className="name">{detail.class.name}</span>
          <ChevronDown size={16} />
        </button>
      </div>

      <Popover anchor={menu} onClose={() => setMenu(null)}>
        {staff && <MenuItem icon={UserPlus} onClick={run(() => openModal("invite", { classId }))}>Invite people</MenuItem>}
        {staff && <MenuItem icon={Hash} onClick={run(() => openModal("channel", { classId }))}>Create channel</MenuItem>}
        <MenuItem icon={Smile} onClick={run(() => openModal("classEmoji", { classId }))}>Class emoji</MenuItem>
        {staff && <MenuItem icon={Settings} onClick={run(() => openModal("classSettings", { classId }))}>Class settings</MenuItem>}
        {staff && <div className="menu-sep" />}
        {detail.myRole === "owner" ? (
          <MenuItem icon={Trash2} danger onClick={run(() => openModal("deleteClass", { classId }))}>Delete class</MenuItem>
        ) : (
          <MenuItem icon={DoorOpen} danger onClick={run(() => openModal("leaveClass", { classId }))}>Leave class</MenuItem>
        )}
      </Popover>

      <div className="sidebar-scroll">
        <GettingStarted detail={detail} activeChannelId={activeChannelId} />

        {staff && (
          <button type="button" className="invite-btn" onClick={() => openModal("invite", { classId })}>
            <UserPlus size={16} /> Invite people
          </button>
        )}

        <section className="sidebar-section">
          <div className="section-head">
            <span>Channels</span>
            {staff && (
              <IconButton size="sm" label="Create channel" onClick={() => openModal("channel", { classId })}>
                <Plus size={16} />
              </IconButton>
            )}
          </div>
          {channels.map((c) => (
            <ChannelItem key={c.id} channel={c} classId={classId} active={c.id === activeChannelId} />
          ))}
        </section>

        <section className="sidebar-section">
          <div className="section-head">
            <span>Private messages</span>
            <IconButton size="sm" label="New private message" onClick={() => openModal("newDm", { classId })}>
              <Plus size={16} />
            </IconButton>
          </div>
          {dms.length === 0 && (
            <button type="button" className="nav-item" onClick={() => openModal("newDm", { classId })}>
              <span className="label muted">Start a private chat</span>
            </button>
          )}
          {dms.map((c) => (
            <DmItem key={c.id} channel={c} classId={classId} active={c.id === activeChannelId} />
          ))}
        </section>
      </div>

      <button type="button" className="me-card" onClick={() => openModal("profile")} title="Profile, settings and log out">
        <Avatar user={me} size={34} online ring="var(--surface-2)" />
        <span className="who">
          <strong>{me.displayName}</strong>
          <span>{me.statusText || `@${me.username}`}</span>
        </span>
        <Settings size={18} className="me-card-icon" />
      </button>
    </aside>
  );
}
