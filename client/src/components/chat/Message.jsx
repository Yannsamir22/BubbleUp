import { memo, useState } from "react";
import { Copy, MoreHorizontal, Pencil, Pin, PinOff, Reply, RotateCcw, SmilePlus, Trash2, X, CheckCheck, CornerDownRight } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { formatFull, formatTime } from "../../lib/format.js";
import { EmojiGlyph, Markdown } from "../../lib/markdown.jsx";
import { QUICK_REACTIONS } from "../../lib/fun.js";
import { Avatar, IconButton, MenuItem, Popover, Spinner } from "../ui/primitives.jsx";
import { EmojiPicker } from "../ui/EmojiPicker.jsx";
import { Attachments } from "./Attachments.jsx";
import { Poll } from "./Poll.jsx";
import { PickWheel } from "./PickWheel.jsx";
import { ChessCard } from "../chess/ChessCard.jsx";
import { ImposterCard } from "../imposter/ImposterCard.jsx";
import { WordChainCard } from "../word-chain/WordChainCard.jsx";
import { CountdownCard } from "./CountdownCard.jsx";

export const Message = memo(function Message({ message: m, grouped, members, myRole, channelKind, usernames, emojis, highlighted, seen, onOpenImage }) {
  const me = useStore((s) => s.me);
  const editing = useStore((s) => s.editingId === m.id);
  const touchActive = useStore((s) => s.touchActiveId === m.id);
  const online = useStore((s) => (m.author && !m.author.bot ? !!s.online[m.author.id] : undefined));
  const [menu, setMenu] = useState(null);
  const [picker, setPicker] = useState(null);

  if (m.kind === "system") {
    return (
      <div className="msg-system" data-mid={m.id}>
        <Markdown text={m.body} />
        <time dateTime={new Date(m.createdAt).toISOString()}>{formatTime(m.createdAt)}</time>
      </div>
    );
  }

  const member = m.author && members[m.author.id];
  const author = member ?? m.author; // live profile beats the snapshot
  const mine = m.author?.id === me.id && m.kind === "user";
  const staff = isStaffRole(myRole);
  const isTemp = typeof m.id === "string";
  const canDelete = !isTemp && !m.deleted && (mine || staff);
  const canPin = !isTemp && !m.deleted && (staff || channelKind === "dm");
  const s = useStore.getState;
  const close = () => setMenu(null);

  const confirmDelete = () => {
    close();
    s().openModal("confirm", {
      title: "Delete message?",
      body: "It will be removed for everyone. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => s().deleteMessage(m),
    });
  };

  const classes = [
    "msg",
    grouped && "grouped",
    mine && "mine",
    m.kind === "bot" && "bot",
    m.pending && "pending",
    m.failed && "failed",
    highlighted && "highlighted",
    touchActive && "touch-active",
    m.pinned && "pinned",
    !m.deleted && m.body && usernames && mentionsMe(m.body, me.username) && "mentioned",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      data-mid={m.id}
      onClick={(e) => {
        if (!TOUCH.matches || isTemp || m.deleted || e.target.closest("button, a, input, textarea, audio, video")) return;
        s().setTouchActive(m.id);
      }}
      aria-label={`${author?.displayName ?? "Unknown"} at ${formatTime(m.createdAt)}`}>
      <div className="msg-gutter">
        {grouped ? (
          <time className="msg-hover-time" dateTime={new Date(m.createdAt).toISOString()} title={formatFull(m.createdAt)}>
            {formatTime(m.createdAt)}
          </time>
        ) : (
          <Avatar user={author} size={38} online={online} />
        )}
      </div>

      <div className="msg-main">
        {m.replyTo && (
          <button type="button" className="msg-reply-ref" onClick={() => s().jumpTo(m.channelId, m.replyTo.id)}>
            <CornerDownRight size={14} />
            {m.replyTo.deleted ? (
              <em className="muted">Original message was deleted</em>
            ) : (
              <>
                <strong>{m.replyTo.author?.displayName ?? "Someone"}</strong>
                <span className="excerpt">{m.replyTo.body || (m.replyTo.hasAttachments ? "Attachment" : "…")}</span>
              </>
            )}
          </button>
        )}

        {!grouped && (
          <header className="msg-head">
            <span className="msg-author">{author?.displayName ?? "Unknown"}</span>
            {m.kind === "bot" && <span className="role-tag bot">Bot</span>}
            {member?.role === "owner" && <span className="role-tag owner">Owner</span>}
            {member?.role === "teacher" && <span className="role-tag">Teacher</span>}
            <time dateTime={new Date(m.createdAt).toISOString()} title={formatFull(m.createdAt)}>
              {formatTime(m.createdAt)}
            </time>
            {m.pinned && (
              <span className="msg-pin-flag" title="Pinned">
                <Pin size={12} /> pinned
              </span>
            )}
          </header>
        )}

        {m.deleted ? (
          <p className="msg-deleted">{m.deletedByStaff ? "Removed by a teacher" : "Message deleted"}</p>
        ) : editing ? (
          <EditBox message={m} />
        ) : (
          <>
            {m.body && m.meta?.type !== "pick" && m.meta?.type !== "countdown" && (
              <Markdown text={m.body} me={me.username} usernames={usernames} emojis={emojis} onImageClick={(url) => onOpenImage({ url, name: "image" })} />
            )}
            {m.meta?.type === "pick" && <PickWheel meta={m.meta} createdAt={m.createdAt} />}
            {m.meta?.type === "countdown" && <CountdownCard meta={m.meta} />}
            {m.chess && <ChessCard initial={m.chess} />}
            {m.imposter && <ImposterCard initial={m.imposter} />}
            {m.wordChain && <WordChainCard initial={m.wordChain} />}
            {m.editedAt && <span className="msg-edited" title={`Edited ${formatFull(m.editedAt)}`}>(edited)</span>}
            {m.attachments?.length > 0 && <Attachments attachments={m.attachments} onOpenImage={onOpenImage} />}
            {m.poll && <Poll message={m} canClose={mine || staff} />}
          </>
        )}

        {m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => {
              const reacted = r.userIds.includes(me.id);
              const names = r.userIds.map((id) => (id === me.id ? "You" : members[id]?.displayName ?? "Someone")).join(", ");
              return (
                <button
                  key={r.emoji}
                  type="button"
                  className={`reaction${reacted ? " reacted" : ""}`}
                  onClick={() => s().toggleReaction(m, r.emoji)}
                  title={`${names} reacted with ${r.emoji}`}
                  aria-pressed={reacted}
                >
                  <EmojiGlyph value={r.emoji} emojis={emojis} size={18} />
                  <span className="count">{r.count}</span>
                </button>
              );
            })}
            <button type="button" className="reaction add" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())} aria-label="Add reaction">
              <SmilePlus size={15} />
            </button>
          </div>
        )}

        {m.pending && (
          <span className="msg-status">
            <Spinner size={11} /> Sending…
          </span>
        )}
        {m.failed && (
          <span className="msg-status error">
            Couldn't send: {m.failed}
            <button type="button" onClick={() => s().retrySend(m.channelId, m)}>
              <RotateCcw size={12} /> Retry
            </button>
            <button type="button" onClick={() => s().removeLocal(m.channelId, m.id)}>
              <X size={12} /> Discard
            </button>
          </span>
        )}
        {seen && (
          <span className="msg-status seen">
            <CheckCheck size={13} /> Seen
          </span>
        )}
      </div>

      {!isTemp && !m.deleted && (
        <div className="msg-actions" role="toolbar" aria-label="Message actions">
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} type="button" className="quick-react" onClick={() => s().toggleReaction(m, e)} aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
          <IconButton size="sm" label="Add reaction" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}>
            <SmilePlus size={16} />
          </IconButton>
          <IconButton size="sm" label="Reply" onClick={() => s().setReplyTo(m.channelId, m)}>
            <Reply size={16} />
          </IconButton>
          <IconButton size="sm" label="More" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
            <MoreHorizontal size={16} />
          </IconButton>
        </div>
      )}

      <Popover anchor={menu} onClose={close} align="end">
        <MenuItem icon={Reply} onClick={() => { close(); s().setReplyTo(m.channelId, m); }}>Reply</MenuItem>
        {mine && m.body && <MenuItem icon={Pencil} onClick={() => { close(); s().setEditing(m.id); }}>Edit</MenuItem>}
        {m.body && (
          <MenuItem icon={Copy} onClick={() => { close(); navigator.clipboard?.writeText(m.body).then(() => s().toast("Copied to clipboard")); }}>
            Copy text
          </MenuItem>
        )}
        {canPin && (
          <MenuItem icon={m.pinned ? PinOff : Pin} onClick={() => { close(); s().attempt(() => s().setPinned(m, !m.pinned)).catch(() => {}); }}>
            {m.pinned ? "Unpin" : "Pin to channel"}
          </MenuItem>
        )}
        {canDelete && (
          <>
            <div className="menu-sep" />
            <MenuItem icon={Trash2} danger onClick={confirmDelete}>
              {mine ? "Delete" : "Delete (moderate)"}
            </MenuItem>
          </>
        )}
      </Popover>

      {picker && (
        <EmojiPicker
          anchor={picker}
          align="end"
          onClose={() => setPicker(null)}
          onPick={(e) => {
            setPicker(null);
            s().toggleReaction(m, e);
          }}
        />
      )}
    </article>
  );
});

const TOUCH = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(hover: none)") : { matches: false };

function mentionsMe(body, username) {
  const lower = body.toLowerCase();
  return lower.includes(`@${username.toLowerCase()}`) || lower.includes("@everyone");
}

function EditBox({ message }) {
  const [text, setText] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const s = useStore.getState;
  async function save() {
    const body = text.trim();
    if (!body || body === message.body) return s().setEditing(null);
    setBusy(true);
    await s()
      .attempt(() => s().editMessage(message, body))
      .catch(() => setBusy(false));
  }
  return (
    <div className="edit-box">
      <textarea
        className="textarea"
        value={text}
        autoFocus
        rows={Math.min(8, text.split("\n").length + 1)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") s().setEditing(null);
        }}
      />
      <div className="edit-hint">
        Esc to <button type="button" onClick={() => s().setEditing(null)}>cancel</button> · Enter to{" "}
        <button type="button" onClick={save} disabled={busy}>save</button>
      </div>
    </div>
  );
}

export function EphemeralMessage({ entry, channelId }) {
  const dismiss = useStore((s) => s.dismissEphemeral);
  return (
    <article className="msg bot ephemeral">
      <div className="msg-gutter">
        <Avatar user={entry.author} size={38} />
      </div>
      <div className="msg-main">
        <header className="msg-head">
          <span className="msg-author">{entry.author.displayName}</span>
          <span className="role-tag bot">Bot</span>
          <span className="ephemeral-note">Only you can see this</span>
        </header>
        <Markdown text={entry.body} />
      </div>
      <IconButton size="sm" label="Dismiss" className="ephemeral-close" onClick={() => dismiss(channelId, entry.id)}>
        <X size={14} />
      </IconButton>
    </article>
  );
}
