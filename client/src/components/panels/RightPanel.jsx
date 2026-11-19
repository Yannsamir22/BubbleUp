import { useEffect, useMemo, useState } from "react";
import { Ban, Crown, GraduationCap, MessageCircle, MoreVertical, Pin, Search, Swords, UserMinus, Volume2, VolumeX, X } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { api } from "../../lib/api.js";
import { chatPath, navigate } from "../../lib/router.js";
import { formatDay, formatTime } from "../../lib/format.js";
import { Avatar, Empty, IconButton, MenuItem, Popover, Spinner } from "../ui/primitives.jsx";
import { countdownView } from "../../lib/countdown.js";

const TITLES = { members: "People", pins: "Pinned messages", search: "Search" };

export function RightPanel({ panel, channel, detail }) {
  const setPanel = useStore((s) => s.setPanel);
  return (
    <aside className="panel" aria-label={TITLES[panel]}>
      <div className="panel-head">
        <h2>{TITLES[panel]}</h2>
        <IconButton label="Close panel" onClick={() => setPanel(panel)}>
          <X size={18} />
        </IconButton>
      </div>
      {panel === "members" && <MembersPanel detail={detail} />}
      {panel === "pins" && <PinsPanel channel={channel} />}
      {panel === "search" && <SearchPanel detail={detail} channel={channel} />}
    </aside>
  );
}

const ROLE_ORDER = { owner: 0, teacher: 1, student: 2 };

function MembersPanel({ detail }) {
  const online = useStore((s) => s.online);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Object.values(detail.members)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName));
    return [
      { title: "Teachers", items: list.filter((m) => m.role !== "student") },
      { title: "Online", items: list.filter((m) => m.role === "student" && online[m.id]) },
      { title: "Offline", items: list.filter((m) => m.role === "student" && !online[m.id]) },
    ].filter((g) => g.items.length);
  }, [detail.members, online, query]);

  return (
    <>
      <div className="panel-search">
        <input className="input" placeholder="Find someone…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter members" />
      </div>
      <div className="panel-body">
        {groups.map((g) => (
          <section key={g.title}>
            <div className="member-group-title">
              {g.title} — {g.items.length}
            </div>
            {g.items.map((m) => (
              <MemberRow key={m.id} member={m} detail={detail} online={!!online[m.id]} />
            ))}
          </section>
        ))}
        {groups.length === 0 && <Empty title="Nobody by that name" />}
      </div>
    </>
  );
}

function MemberRow({ member, detail, online }) {
  const [menu, setMenu] = useState(null);
  const me = useStore((s) => s.me);
  const s = useStore.getState;
  const classId = detail.class.id;
  const isMe = member.id === me.id;
  const myRank = ROLE_ORDER[detail.myRole];
  const canModerate = isStaffRole(detail.myRole) && !isMe && ROLE_ORDER[member.role] > myRank;
  const isOwner = detail.myRole === "owner";
  const muted = member.mutedUntil && member.mutedUntil > Date.now();
  const close = () => setMenu(null);
  const act = (fn, ok) => async () => {
    close();
    try {
      await fn();
      if (ok) s().toast(ok, "success");
    } catch (err) {
      s().toast(err.message, "error");
    }
  };

  /** Opens (or creates) the private chat and posts a chess challenge there. */
  async function challenge() {
    close();
    try {
      const ch = await s().openDm(classId, member.id);
      navigate(chatPath(classId, ch.id));
      await s().challengeChess(ch.id, member.id);
      s().toast(`Challenge sent to ${member.displayName}`, "success");
    } catch (err) {
      s().toast(err.message, "error");
    }
  }

  async function message() {
    close();
    try {
      const ch = await s().openDm(classId, member.id);
      navigate(chatPath(classId, ch.id));
    } catch (err) {
      s().toast(err.message, "error");
    }
  }

  return (
    <div className={`member-row${online ? "" : " offline"}`}>
      <Avatar user={member} size={34} online={online} />
      <div className="who">
        <strong>
          <span>{member.displayName}</span>
          {member.role === "owner" && <span className="role-tag owner">Owner</span>}
          {member.role === "teacher" && <span className="role-tag">Teacher</span>}
          {isMe && <span className="muted" style={{ fontWeight: 400 }}>(you)</span>}
          {muted && <span className="role-tag muted-tag">Muted</span>}
        </strong>
        <small>{member.statusText || `@${member.username}`}</small>
      </div>
      {!isMe && (
        <IconButton size="sm" label={`Options for ${member.displayName}`} onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
          <MoreVertical size={16} />
        </IconButton>
      )}
      <Popover anchor={menu} onClose={close} align="end">
        <MenuItem icon={MessageCircle} onClick={message}>Send a message</MenuItem>
        <MenuItem icon={Swords} onClick={challenge}>Challenge to chess</MenuItem>
        {isOwner && member.role === "student" && (
          <MenuItem icon={GraduationCap} onClick={act(() => s().setRole(classId, member.id, "teacher"), `${member.displayName} is now a teacher`)}>
            Make teacher
          </MenuItem>
        )}
        {isOwner && member.role === "teacher" && (
          <>
            <MenuItem icon={GraduationCap} onClick={act(() => s().setRole(classId, member.id, "student"), "Role updated")}>Make student</MenuItem>
            <MenuItem
              icon={Crown}
              onClick={() => {
                close();
                s().openModal("confirm", {
                  title: "Transfer ownership?",
                  body: `${member.displayName} will become the owner and you'll become a teacher. Only they can undo this.`,
                  confirmLabel: "Transfer",
                  onConfirm: () => s().setRole(classId, member.id, "owner"),
                });
              }}
            >
              Transfer ownership
            </MenuItem>
          </>
        )}
        {canModerate && (
          <>
            <div className="menu-sep" />
            <div className="menu-label">Moderation</div>
            {muted ? (
              <MenuItem icon={Volume2} onClick={act(() => s().muteMember(classId, member.id, 0), "Unmuted")}>Unmute</MenuItem>
            ) : (
              <>
                <MenuItem icon={VolumeX} onClick={act(() => s().muteMember(classId, member.id, 10), "Muted for 10 minutes")}>Mute 10 minutes</MenuItem>
                <MenuItem icon={VolumeX} onClick={act(() => s().muteMember(classId, member.id, 60), "Muted for 1 hour")}>Mute 1 hour</MenuItem>
                <MenuItem icon={Ban} onClick={act(() => s().muteMember(classId, member.id, 60 * 24), "Muted for 24 hours")}>Mute 24 hours</MenuItem>
              </>
            )}
            <MenuItem
              icon={UserMinus}
              danger
              onClick={() => {
                close();
                s().openModal("confirm", {
                  title: `Remove ${member.displayName}?`,
                  body: "They'll be removed from the class. They can rejoin with the invite code unless you reset it.",
                  confirmLabel: "Remove",
                  danger: true,
                  onConfirm: () => s().kickMember(classId, member.id),
                });
              }}
            >
              Remove from class
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

/** Pinned countdowns show where they are now, not the date they were posted with. */
function countdownLine(meta) {
  const v = countdownView(meta);
  return `${v.emoji} ${v.headline}`;
}

function ResultCard({ message, channelName, onClick }) {
  return (
    <button type="button" className="result-card" onClick={onClick}>
      <div className="result-meta">
        <Avatar user={message.author} size={20} />
        <strong>{message.author?.displayName ?? "System"}</strong>
        {channelName && <span>in {channelName}</span>}
        <span style={{ marginLeft: "auto" }}>
          {formatDay(message.createdAt)} {formatTime(message.createdAt)}
        </span>
      </div>
      <div className="result-body">{message.meta?.type === "countdown" ? countdownLine(message.meta) : message.body || (message.attachments?.length ? `Attachment: ${message.attachments.map((a) => a.name).join(", ")}` : message.poll ? `Poll: ${message.poll.question}` : "")}</div>
    </button>
  );
}

function PinsPanel({ channel }) {
  const [pins, setPins] = useState(null);
  // Refetch when any message in the list changes pin state.
  const pinKey = useStore((s) =>
    (s.messages[channel.id]?.items ?? [])
      .filter((m) => m.pinned)
      .map((m) => m.id)
      .join(","),
  );
  useEffect(() => {
    let alive = true;
    api
      .get(`/channels/${channel.id}/pins`)
      .then((r) => alive && setPins(r.messages))
      .catch(() => alive && setPins([]));
    return () => {
      alive = false;
    };
  }, [channel.id, pinKey]);

  return (
    <div className="panel-body">
      {pins === null && <Spinner />}
      {pins?.length === 0 && (
        <Empty icon={Pin} title="Nothing pinned yet">
          {channel.kind === "dm" ? "Pin important messages from the ⋯ menu." : "Teachers can pin important messages from the ⋯ menu."}
        </Empty>
      )}
      {pins?.map((m) => (
        <ResultCard key={m.id} message={m} onClick={() => useStore.getState().jumpTo(channel.id, m.id)} />
      ))}
    </div>
  );
}

function SearchPanel({ detail, channel }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("class");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const classId = detail.class.id;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      const extra = scope === "channel" ? `&channelId=${channel.id}` : "";
      api
        .get(`/classes/${classId}/search?q=${encodeURIComponent(q)}${extra}`)
        .then((r) => setResults(r.messages))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, scope, classId, channel.id]);

  function open(m) {
    navigate(chatPath(classId, m.channelId));
    useStore.getState().jumpTo(m.channelId, m.id);
  }

  const channelName = (id) => {
    const c = detail.channels[id];
    if (!c) return "";
    return c.kind === "dm" ? `DM with ${c.dmUser?.displayName}` : `#${c.name}`;
  };

  return (
    <>
      <div className="panel-search" style={{ display: "grid", gap: 8 }}>
        <span className="input-with-btn">
          <input className="input" autoFocus placeholder="Search messages…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search messages" />
          <span className="icon-btn" aria-hidden="true">
            {loading ? <Spinner size={14} /> : <Search size={16} />}
          </span>
        </span>
        <div className="segmented">
          <button type="button" className={scope === "class" ? "active" : ""} onClick={() => setScope("class")}>
            Whole class
          </button>
          <button type="button" className={scope === "channel" ? "active" : ""} onClick={() => setScope("channel")}>
            This channel
          </button>
        </div>
      </div>
      <div className="panel-body">
        {results === null && <Empty icon={Search} title="Search messages">Type at least 2 letters. Searching "photo" also finds "photosynthesis".</Empty>}
        {results?.length === 0 && <Empty title="No results">Try fewer or different words.</Empty>}
        {results?.map((m) => (
          <ResultCard key={m.id} message={m} channelName={channelName(m.channelId)} onClick={() => open(m)} />
        ))}
      </div>
    </>
  );
}
