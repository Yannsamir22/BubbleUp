import { useMemo, useState } from "react";
import { Copy, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../../store/index.js";
import { chatPath, navigate } from "../../lib/router.js";
import { AVATAR_COLORS, AVATAR_EMOJIS, CLASS_EMOJIS } from "../../lib/fun.js";
import { notificationsSupported } from "../../lib/browser.js";
import { Avatar, Button, IconButton, Modal, initials } from "../ui/primitives.jsx";
import { CreateClassForm, JoinClassForm } from "../onboarding/ClassForms.jsx";
import { HelpModal } from "./HelpModal.jsx";
import { ChessChallengeModal, ClassEmojiModal, PickModal } from "./FunModals.jsx";
import { ChessModal } from "../chess/ChessModal.jsx";
import { ImposterModal } from "../imposter/ImposterModal.jsx";
import { ImposterCreateModal } from "../imposter/ImposterCreateModal.jsx";

/** Renders whichever modal is open in the store. */
export function ModalHost() {
  const modal = useStore((s) => s.modal);
  const close = useStore((s) => s.closeModal);
  if (!modal) return null;
  const props = { ...modal.props, onClose: close };
  switch (modal.type) {
    case "chess":
      return <ChessModal {...props} />;
    case "chessChallenge":
      return <ChessChallengeModal {...props} />;
    case "imposter":
      return <ImposterModal {...props} />;
    case "imposterCreate":
      return <ImposterCreateModal {...props} />;
    case "pick":
      return <PickModal {...props} />;
    case "classEmoji":
      return <ClassEmojiModal {...props} />;
    case "help":
      return <HelpModal {...props} />;
    case "addClass":
      return <AddClassModal {...props} />;
    case "invite":
      return <InviteModal {...props} />;
    case "classSettings":
      return <ClassSettingsModal {...props} />;
    case "channel":
      return <ChannelModal {...props} />;
    case "profile":
      return <ProfileModal {...props} />;
    case "poll":
      return <PollModal {...props} />;
    case "newDm":
      return <NewDmModal {...props} />;
    case "confirm":
      return <ConfirmModal {...props} />;
    case "leaveClass":
      return <LeaveClassModal {...props} />;
    case "deleteClass":
      return <DeleteClassModal {...props} />;
    default:
      return null;
  }
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

function AddClassModal({ onClose }) {
  const [tab, setTab] = useState("join");
  return (
    <Modal title="Add a class" onClose={onClose}>
      <div className="segmented" style={{ width: "100%" }}>
        <button type="button" style={{ flex: 1 }} className={tab === "join" ? "active" : ""} onClick={() => setTab("join")}>
          Join with a code
        </button>
        <button type="button" style={{ flex: 1 }} className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
          Create a class
        </button>
      </div>
      {tab === "join" ? <JoinClassForm onDone={onClose} /> : <CreateClassForm onDone={onClose} />}
    </Modal>
  );
}

function CodeRow({ label, hint, code }) {
  const toast = useStore((s) => s.toast);
  const link = `${window.location.origin}`;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="code-chip">{code}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigator.clipboard
              ?.writeText(`Join our class on BubbleUp: ${link}\nClick "Join a class" and enter the code ${code}`)
              .then(() => toast("Invitation copied. Paste it in an email or message.", "success"))
          }
        >
          <Copy size={14} /> Copy invite
        </Button>
      </div>
      <span className="field-hint">{hint}</span>
    </div>
  );
}

function InviteModal({ classId, onClose }) {
  const cls = useStore((s) => s.details[classId]?.class);
  if (!cls) return null;
  return (
    <Modal title={`Invite people to ${cls.name}`} subtitle={`People open ${window.location.origin}, create an account, choose “Join a class” and type the code.`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <CodeRow label="Student code" code={cls.studentCode} hint="Give this to your students. You can write it on the board." />
      <CodeRow label="Teacher code" code={cls.teacherCode} hint="Only for other teachers. It lets them moderate the class." />
    </Modal>
  );
}

function ClassSettingsModal({ classId, onClose }) {
  const detail = useStore((s) => s.details[classId]);
  const [name, setName] = useState(detail.class.name);
  const [description, setDescription] = useState(detail.class.description);
  const [emoji, setEmoji] = useState(detail.class.emoji);
  const { busy, error, run } = useBusy();
  const s = useStore.getState;
  const isOwner = detail.myRole === "owner";

  async function save() {
    if (await run(() => s().updateClass(classId, { name, description, emoji }))) {
      s().toast("Class updated", "success");
      onClose();
    }
  }

  return (
    <Modal
      title="Class settings"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Save</Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </label>
      <div className="field">
        <span className="field-label">Icon</span>
        <div className="emoji-row">
          {CLASS_EMOJIS.map((e) => (
            <button key={e} type="button" className={`emoji-choice${emoji === e ? " active" : ""}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
      {isOwner && (
        <div className="field">
          <span className="field-label">Invite codes</span>
          <span className="field-hint">Leaked a code? Reset both. Existing members stay; old codes stop working.</span>
          <div>
            <Button size="sm" variant="outline" onClick={() => run(() => s().regenerateCodes(classId)).then((ok) => ok && s().toast("New codes created. The old ones no longer work.", "success"))}>
              <RefreshCw size={14} /> Reset invite codes
            </Button>
          </div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function ChannelModal({ classId, channel, onClose }) {
  const editing = !!channel;
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [kind, setKind] = useState(channel?.kind ?? "text");
  const { busy, error, run } = useBusy();
  const s = useStore.getState;
  const preview = name.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");

  async function save() {
    let created;
    const ok = await run(async () => {
      if (editing) await s().updateChannel(channel.id, { name, topic, kind });
      else created = await s().createChannel(classId, { name, topic, kind });
    });
    if (!ok) return;
    onClose();
    if (created) navigate(chatPath(classId, created.id));
  }

  function remove() {
    s().openModal("confirm", {
      title: `Delete #${channel.name}?`,
      body: "All messages and files in this channel will be deleted permanently. This can't be undone.",
      confirmLabel: "Delete channel",
      danger: true,
      onConfirm: async () => {
        await s().deleteChannel(classId, channel.id);
        navigate(chatPath(classId), { replace: true });
      },
    });
  }

  return (
    <Modal
      title={editing ? `Edit #${channel.name}` : "Create a channel"}
      subtitle={editing ? null : "Channels keep conversations organised — one per subject, project or vibe."}
      onClose={onClose}
      footer={
        <>
          {editing && channel.name !== "general" && (
            <Button variant="ghost" onClick={remove} style={{ marginRight: "auto", color: "var(--danger)" }}>
              <Trash2 size={16} /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!preview}>
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. lab-reports" maxLength={32} disabled={channel?.name === "general"} />
        {preview && <span className="field-hint">Will appear as #{preview}</span>}
      </label>
      <label className="field">
        <span className="field-label">Topic <span className="muted">(optional)</span></span>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this channel about?" maxLength={120} />
      </label>
      <div className="field">
        <span className="field-label">Who can post?</span>
        <div className="segmented">
          <button type="button" className={kind === "text" ? "active" : ""} onClick={() => setKind("text")}>Everyone</button>
          <button type="button" className={kind === "announcement" ? "active" : ""} onClick={() => setKind("announcement")}>Teachers only</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function ProfileModal({ onClose }) {
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const s = useStore.getState;
  const [displayName, setDisplayName] = useState(me.displayName);
  const [statusText, setStatusText] = useState(me.statusText);
  const [avatarEmoji, setAvatarEmoji] = useState(me.avatarEmoji);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [pw, setPw] = useState({ current: "", next: "" });
  const { busy, error, run } = useBusy();
  const [notif, setNotif] = useState(notificationsSupported() ? Notification.permission : "unsupported");

  async function save() {
    if (await run(() => s().updateProfile({ displayName, statusText, avatarEmoji, avatarColor }))) {
      s().toast("Profile saved", "success");
      onClose();
    }
  }

  async function changePassword() {
    if (await run(() => s().changePassword(pw.current, pw.next))) {
      setPw({ current: "", next: "" });
      s().toast("Password changed. You were logged out on other devices.", "success");
    }
  }

  return (
    <Modal
      title="Profile & settings"
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => s().logout()} style={{ marginRight: "auto" }}>
            <LogOut size={16} /> Log out
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Save profile</Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Avatar user={{ ...me, avatarEmoji, avatarColor, displayName }} size={72} />
        <div style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 18 }}>{displayName || me.username}</strong>
          <span className="muted">@{me.username}</span>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Picture</span>
        <div className="emoji-row">
          {AVATAR_EMOJIS.map((e) => (
            <button key={e || "initials"} type="button" className={`emoji-choice${avatarEmoji === e ? " active" : ""}`} onClick={() => setAvatarEmoji(e)} title={e ? undefined : "Use my initials"}>
              {e || <span className="initials-choice">{initials(displayName || me.username)}</span>}
            </button>
          ))}
        </div>
        <div className="emoji-row" style={{ marginTop: 6 }}>
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} className={`color-choice${avatarColor === c ? " active" : ""}`} style={{ background: c }} onClick={() => setAvatarColor(c)} />
          ))}
        </div>
      </div>
      <label className="field">
        <span className="field-label">Display name</span>
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
      </label>
      <label className="field">
        <span className="field-label">Status</span>
        <input className="input" value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="e.g. Revising for the maths test" maxLength={80} />
      </label>

      <div className="field">
        <span className="field-label">Appearance</span>
        <div className="segmented">
          {[["system", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([v, label]) => (
            <button key={v} type="button" className={settings.theme === v ? "active" : ""} onClick={() => s().setSetting("theme", v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle-row">
        <span>
          <strong>Sounds</strong>
          <br />
          <span className="field-hint">A short sound when a message arrives.</span>
        </span>
        <input type="checkbox" className="switch" checked={settings.sound} onChange={(e) => s().setSetting("sound", e.target.checked)} />
      </label>
      <label className="toggle-row">
        <span>
          <strong>Message effects</strong>
          <br />
          <span className="field-hint">Confetti and balloons for messages like “congrats” or “happy birthday”.</span>
        </span>
        <input type="checkbox" className="switch" checked={settings.effects !== false} onChange={(e) => s().setSetting("effects", e.target.checked)} />
      </label>
      <div className="toggle-row">
        <span>
          <strong>Desktop notifications</strong>
          <br />
          <span className="field-hint">
            {notif === "unsupported"
              ? "Needs HTTPS (or localhost) and a supporting browser."
              : notif === "granted"
                ? "On — you'll be notified about DMs and @mentions."
                : notif === "denied"
                  ? "Blocked in your browser settings."
                  : "Get notified about DMs and @mentions."}
          </span>
        </span>
        {notif === "default" && (
          <Button size="sm" variant="outline" onClick={() => Notification.requestPermission().then(setNotif)}>
            Enable
          </Button>
        )}
      </div>

      <div className="field">
        <span className="field-label">Change password</span>
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" type="password" placeholder="New password (6+ chars)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <Button variant="outline" onClick={changePassword} disabled={!pw.current || pw.next.length < 6 || busy}>
            Update
          </Button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function PollModal({ channelId, onClose }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const s = useStore.getState;
  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  function submit() {
    s().sendMessage(channelId, {
      poll: { question: question.trim(), options: options.map((o) => o.trim()).filter(Boolean), multiple, anonymous },
    });
    onClose();
  }

  return (
    <Modal
      title="Create a poll"
      subtitle="Everyone in the channel can vote. They see the results after voting."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>Post poll</Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Question</span>
        <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Pizza or pasta for the class party?" maxLength={200} />
      </label>
      <div className="field">
        <span className="field-label">Options</span>
        {options.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Option ${i + 1}`}
              maxLength={100}
            />
            {options.length > 2 && (
              <IconButton label="Remove option" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setOptions([...options, ""])}>
              <Plus size={14} /> Add option
            </Button>
          </div>
        )}
      </div>
      <label className="toggle-row">
        <span>Allow multiple answers</span>
        <input type="checkbox" className="switch" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
      </label>
      <label className="toggle-row">
        <span>Anonymous voting (hide who voted for what)</span>
        <input type="checkbox" className="switch" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
      </label>
    </Modal>
  );
}

function NewDmModal({ classId, onClose }) {
  const members = useStore((s) => s.details[classId]?.members);
  const online = useStore((s) => s.online);
  const meId = useStore((s) => s.me.id);
  const [query, setQuery] = useState("");
  const s = useStore.getState;
  const list = useMemo(
    () =>
      Object.values(members ?? {})
        .filter((m) => m.id !== meId)
        .filter((m) => !query || m.displayName.toLowerCase().includes(query.toLowerCase()) || m.username.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => Number(!!online[b.id]) - Number(!!online[a.id]) || a.displayName.localeCompare(b.displayName)),
    [members, meId, query, online],
  );

  async function open(userId) {
    try {
      const ch = await s().openDm(classId, userId);
      onClose();
      navigate(chatPath(classId, ch.id));
    } catch (err) {
      s().toast(err.message, "error");
    }
  }

  return (
    <Modal title="New private message" subtitle="Only you and the person you choose can read it." onClose={onClose}>
      <input className="input" placeholder="Search classmates…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ display: "grid", gap: 2, maxHeight: 360, overflow: "auto" }}>
        {list.map((m) => (
          <button key={m.id} type="button" className="member-row" onClick={() => open(m.id)}>
            <Avatar user={m} size={34} online={!!online[m.id]} />
            <span className="who">
              <strong>
                <span>{m.displayName}</span>
                {m.role !== "student" && <span className={`role-tag ${m.role}`}>{m.role}</span>}
              </strong>
              <small>@{m.username}</small>
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="muted" style={{ textAlign: "center", padding: 16 }}>Nobody else is in this class yet.</p>}
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, body, confirmLabel = "Confirm", danger, onConfirm, onClose }) {
  const { busy, error, run } = useBusy();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={async () => (await run(onConfirm)) && onClose()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: "var(--text-2)" }}>{body}</p>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function LeaveClassModal({ classId, onClose }) {
  const name = useStore((s) => s.details[classId]?.class.name);
  const s = useStore.getState;
  return (
    <ConfirmModal
      title={`Leave ${name}?`}
      body="You'll need an invite code to come back. Your messages stay in the class."
      confirmLabel="Leave class"
      danger
      onClose={onClose}
      onConfirm={async () => {
        await s().leaveClass(classId);
        navigate("/", { replace: true });
      }}
    />
  );
}

function DeleteClassModal({ classId, onClose }) {
  const name = useStore((s) => s.details[classId]?.class.name);
  const [typed, setTyped] = useState("");
  const { busy, error, run } = useBusy();
  const s = useStore.getState;
  return (
    <Modal
      title={`Delete ${name}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={typed !== name}
            loading={busy}
            onClick={async () => {
              if (await run(() => s().deleteClass(classId))) {
                onClose();
                navigate("/", { replace: true });
              }
            }}
          >
            Delete forever
          </Button>
        </>
      }
    >
      <p style={{ color: "var(--text-2)" }}>
        Every channel, message and file in this class will be permanently deleted for everyone. Type <strong>{name}</strong> to confirm.
      </p>
      <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
