import { useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { findChannel, isStaffRole, useStore } from "../../store/index.js";
import { Avatar, Button, IconButton, Modal } from "../ui/primitives.jsx";

/** Choose a classmate to play chess with. The game appears in the current channel. */
export function ChessChallengeModal({ channelId, onClose }) {
  const channel = useStore((s) => findChannel(s, channelId));
  const detail = useStore((s) => (channel ? s.details[channel.classId] : null));
  const online = useStore((s) => s.online);
  const meId = useStore((s) => s.me.id);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const s = useStore.getState;

  const people = useMemo(() => {
    if (!detail) return [];
    const q = query.trim().toLowerCase();
    return Object.values(detail.members)
      .filter((m) => m.id !== meId)
      .filter((m) => channel.kind !== "dm" || m.id === channel.dmUser?.id)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
      .sort((a, b) => Number(!!online[b.id]) - Number(!!online[a.id]) || a.displayName.localeCompare(b.displayName));
  }, [detail, channel, meId, query, online]);

  if (!channel || !detail) return null;
  const where = channel.kind === "dm" ? "this private chat" : `#${channel.name}`;

  async function challenge(userId) {
    setBusy(userId);
    try {
      await s().challengeChess(channel.id, userId);
      s().toast("Challenge sent. The game starts when they accept.", "success");
      onClose();
    } catch (err) {
      s().toast(err.message, "error");
      setBusy(null);
    }
  }

  return (
    <Modal title="Play chess" subtitle={`Pick someone to challenge. The game card appears in ${where}, so others can watch.`} onClose={onClose}>
      {channel.kind !== "dm" && <input className="input" placeholder="Search classmates…" value={query} onChange={(e) => setQuery(e.target.value)} />}
      <div className="pick-list">
        {people.map((m) => (
          <button key={m.id} type="button" className="member-row" onClick={() => challenge(m.id)} disabled={busy !== null}>
            <Avatar user={m} size={34} online={!!online[m.id]} />
            <span className="who">
              <strong>
                <span>{m.displayName}</span>
              </strong>
              <small>{online[m.id] ? "Online now" : `@${m.username}`}</small>
            </span>
            <span className="btn btn-sm btn-outline">{busy === m.id ? "Sending…" : "Challenge"}</span>
          </button>
        ))}
        {people.length === 0 && <p className="muted" style={{ padding: 12 }}>Nobody to challenge here yet.</p>}
      </div>
    </Modal>
  );
}

/** Random picker: spin a wheel over typed options or the class's students. */
export function PickModal({ channelId, onClose }) {
  const [text, setText] = useState("");
  const s = useStore.getState;
  const options = text.split(/,|\n/).map((o) => o.trim()).filter(Boolean);
  const valid = options.length === 0 || options.length >= 2;

  function spin() {
    s().sendMessage(channelId, { body: options.length ? `/pick ${options.join(", ")}` : "/pick" });
    onClose();
  }

  return (
    <Modal
      title="Random picker"
      subtitle="Spins a wheel in the channel so everyone sees the result."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={spin} disabled={!valid}>Spin the wheel</Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Options</span>
        <textarea
          className="textarea"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Leave empty to pick a random student,\nor write options: one per line or separated by commas"}
        />
        <span className="field-hint">
          {options.length === 0
            ? "Empty: picks one student (online students first)."
            : options.length === 1
              ? "Add at least one more option."
              : `${options.length} options on the wheel.`}
        </span>
      </label>
    </Modal>
  );
}

const NAME_RE = /^[a-z0-9_]{2,24}$/;
const suggestName = (file) =>
  file.name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

/** Upload and manage the class's own emoji. */
export function ClassEmojiModal({ classId, onClose }) {
  const detail = useStore((s) => s.details[classId]);
  const meId = useStore((s) => s.me.id);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const s = useStore.getState;
  if (!detail) return null;
  const staff = isStaffRole(detail.myRole);

  function choose(f) {
    if (!f) return;
    if (f.size > 256 * 1024) return setError("That image is too big. Emoji must be under 256 KB.");
    setError("");
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(suggestName(f));
  }

  async function add() {
    setBusy(true);
    setError("");
    try {
      await s().addEmoji(classId, file, name);
      s().toast(`Added :${name}:`, "success");
      setFile(null);
      setPreview(null);
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Class emoji" subtitle="Add your own emoji (a photo, a drawing, the teacher's famous mug…). Use them by typing :name: or from the emoji button." onClose={onClose} wide>
      <div className="emoji-upload">
        <button type="button" className="emoji-drop" onClick={() => input.current?.click()} aria-label="Choose an image">
          {preview ? <img src={preview} alt="" /> : <ImagePlus size={26} />}
        </button>
        <input ref={input} type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <div className="field" style={{ flex: 1 }}>
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="e.g. teacher_mug" maxLength={24} />
          <span className="field-hint">Lowercase letters, numbers and _. PNG, GIF, WebP or JPEG under 256 KB. Square images look best.</span>
        </div>
        <Button variant="primary" onClick={add} loading={busy} disabled={!file || !NAME_RE.test(name)}>
          Add emoji
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}

      <div className="field-label">In this class ({detail.emojis.length})</div>
      {detail.emojis.length === 0 ? (
        <p className="muted">None yet. Be the first!</p>
      ) : (
        <div className="emoji-manage">
          {detail.emojis.map((e) => (
            <div key={e.id} className="emoji-item">
              <img src={e.url} alt="" className="custom-emoji" />
              <code>:{e.name}:</code>
              {(staff || e.createdBy === meId) && (
                <IconButton
                  size="sm"
                  label={`Remove :${e.name}:`}
                  onClick={() => s().removeEmoji(classId, e.name).catch((err) => s().toast(err.message, "error"))}
                >
                  <Trash2 size={14} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
