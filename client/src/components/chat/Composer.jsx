import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Dices, Disc3, FileText, Gamepad2, Link2, Mic, Paperclip, SendHorizontal, Smile, Square, Swords, Trash2, Trophy, VenetianMask, X, Reply } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { api } from "../../lib/api.js";
import { canRecordAudio, imageSize, pickAudioMime } from "../../lib/browser.js";
import { composerPlaceholder } from "../../lib/fun.js";
import { formatBytes, formatDuration } from "../../lib/format.js";
import { sendTyping } from "../../hooks/useRealtime.js";
import { composer } from "../../lib/composerBus.js";
import { Avatar, IconButton, MenuItem, Popover } from "../ui/primitives.jsx";
import { EmojiPicker } from "../ui/EmojiPicker.jsx";

const COMMANDS = [
  ["help", "Show everything Thinkmas can do"],
  ["ask", "Ask Thinkmas a question"],
  ["calc", "Calculate, e.g. /calc 12 * (3 + 4)"],
  ["define", "Look up a word"],
  ["image", "Find a picture"],
  ["poll", "Question | Option A | Option B"],
  ["roll", "Roll dice, e.g. /roll 2d6"],
  ["flip", "Flip a coin"],
  ["8ball", "Ask the magic 8-ball"],
  ["joke", "Hear a (terrible) joke"],
  ["shrug", "Append ¯\\_(ツ)_/¯"],
  ["tableflip", "(╯°□°)╯︵ ┻━┻"],
  ["me", "Say something in third person"],
  ["learn", "Teach Thinkmas: question :: answer", true],
  ["pick", "Spin the wheel: random student, or /pick a, b, c"],
  ["chess", "Challenge someone: /chess @username"],
  ["imposter", "Group game: find who doesn't know the word"],
  ["countdown", "Live countdown: /countdown Exam 2026-12-10"],
  ["awards", "This week's class awards"],
];
const MAX_FILES = 10;
const drafts = new Map(); // channelId -> text, survives channel switches

let fileSeq = 0;

export function Composer({ channel, detail }) {
  const [text, setText] = useState(() => drafts.get(channel.id) ?? "");
  const [files, setFiles] = useState([]);
  const [picker, setPicker] = useState(null);
  const [games, setGames] = useState(null);
  const [suggest, setSuggest] = useState(null); // { type, items, index, start }
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(null);
  const input = useRef(null);
  const fileInput = useRef(null);
  const replyTo = useStore((s) => s.replyTo[channel.id]);
  const me = useStore((s) => s.me);
  const staff = isStaffRole(detail.myRole);
  const placeholder = composerPlaceholder(channel);
  const s = useStore.getState;

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "done");
  const canSend = !uploading && (text.trim().length > 0 || ready.length > 0) && !recording;

  useEffect(() => {
    drafts.set(channel.id, text);
  }, [channel.id, text]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.35)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  // The guide and empty-channel tips can focus the box or open the file picker.
  useEffect(() => {
    const offFocus = composer.on("focus", () => input.current?.focus());
    const offAttach = composer.on("attach", () => fileInput.current?.click());
    return () => {
      offFocus();
      offAttach();
    };
  }, []);

  // Free object URLs when files are removed.
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- uploads ----------
  const addFiles = useCallback(
    async (list) => {
      const incoming = [...list].slice(0, MAX_FILES);
      for (const file of incoming) {
        const id = ++fileSeq;
        const controller = new AbortController();
        const entry = {
          id,
          file,
          name: file.name,
          size: file.size,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          progress: 0,
          status: "uploading",
          controller,
        };
        setFiles((prev) => (prev.length >= MAX_FILES ? prev : [...prev, entry]));
        const patch = (p) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));
        try {
          const dims = await imageSize(file);
          const { attachment } = await api.upload(`/classes/${channel.classId}/uploads`, file, { ...dims, duration: file.duration }, {
            onProgress: (p) => patch({ progress: p }),
            signal: controller.signal,
          });
          patch({ status: "done", progress: 1, attachment });
        } catch (err) {
          if (err.code === "aborted") return;
          patch({ status: "error", error: err.message });
          s().toast(`${file.name}: ${err.message}`, "error");
        }
      }
    },
    [channel.classId, s],
  );

  function removeFile(id) {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      f?.controller.abort();
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  }

  // Drag & drop anywhere on the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e) => hasFiles(e) && e.preventDefault();
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  // ---------- sending ----------
  async function send() {
    if (!canSend) return;
    const body = text.trim();
    const attachments = ready.map((f) => f.attachment);
    setText("");
    setFiles([]);
    setSuggest(null);
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    drafts.delete(channel.id);
    await s().sendMessage(channel.id, { body, attachments });
    input.current?.focus();
  }

  // ---------- autocomplete ----------
  function computeSuggest(value, caret) {
    if (/^\/[a-z0-9]*$/i.test(value) && caret === value.length) {
      const q = value.slice(1).toLowerCase();
      const items = COMMANDS.filter(([name, , staffOnly]) => name.startsWith(q) && (!staffOnly || staff)).map(([name, desc]) => ({
        key: name,
        label: `/${name}`,
        desc,
        insert: `/${name} `,
      }));
      return items.length ? { type: "command", items, index: 0, start: 0 } : null;
    }
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)@([a-zA-Z0-9_.-]{0,20})$/);
    if (m) {
      const q = m[2].toLowerCase();
      const people = Object.values(detail.members)
        .filter((u) => u.id !== me.id && (u.username.toLowerCase().startsWith(q) || u.displayName.toLowerCase().includes(q)))
        .slice(0, 7)
        .map((u) => ({ key: `u${u.id}`, label: u.displayName, desc: `@${u.username}`, user: u, insert: `@${u.username} ` }));
      const extras = [
        { key: "thinkmas", label: "Thinkmas", desc: "@thinkmas · ask the bot", user: { bot: true, displayName: "Thinkmas" }, insert: "@thinkmas " },
        ...(staff ? [{ key: "everyone", label: "Everyone", desc: "@everyone · notify the whole class", insert: "@everyone " }] : []),
      ].filter((x) => x.insert.slice(1).startsWith(q));
      const items = [...people, ...extras];
      return items.length ? { type: "mention", items, index: 0, start: caret - m[2].length - 1 } : null;
    }
    // ":par" → class emoji suggestions
    const e = before.match(/(^|\s):([a-z0-9_]{1,24})$/);
    if (e && detail.emojis?.length) {
      const items = detail.emojis
        .filter((x) => x.name.includes(e[2]))
        .slice(0, 8)
        .map((x) => ({ key: `e${x.id}`, label: `:${x.name}:`, desc: "class emoji", image: x.url, insert: `:${x.name}: ` }));
      return items.length ? { type: "emoji", items, index: 0, start: caret - e[2].length - 1 } : null;
    }
    return null;
  }

  function applySuggestion(item) {
    const el = input.current;
    const caret = el.selectionStart;
    const next = suggest.type === "command" ? item.insert : text.slice(0, suggest.start) + item.insert + text.slice(caret);
    setText(next);
    setSuggest(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = suggest.type === "command" ? next.length : suggest.start + item.insert.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onChange(e) {
    const value = e.target.value;
    setText(value);
    setSuggest(computeSuggest(value, e.target.selectionStart));
    if (value.trim() && !value.startsWith("/")) sendTyping(channel.id);
  }

  function onKeyDown(e) {
    if (suggest) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setSuggest((x) => ({ ...x, index: (x.index + d + x.items.length) % x.items.length }));
        return;
      }
      const item = suggest.items[suggest.index];
      const exact = suggest.type === "command" && item.insert.trim() === text.trim();
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !exact)) {
        e.preventDefault();
        applySuggestion(item);
        return;
      }
      if (e.key === "Escape") {
        setSuggest(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape" && replyTo) {
      s().setReplyTo(channel.id, null);
    } else if (e.key === "ArrowUp" && !text) {
      // Edit my last message, like the big chat apps.
      const items = s().messages[channel.id]?.items ?? [];
      const last = [...items].reverse().find((m) => m.author?.id === me.id && m.kind === "user" && !m.deleted && typeof m.id === "number" && m.body);
      if (last) {
        e.preventDefault();
        s().setEditing(last.id);
      }
    }
  }

  function onPaste(e) {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  function insertEmoji(emoji) {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setPicker(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <div className="composer-wrap">
      {dragging && (
        <div className="drop-overlay">
          <div>
            Drop files to share in {channel.kind === "dm" ? "this chat" : `#${channel.name}`}
          </div>
        </div>
      )}

      {suggest && (
        <ul className="suggest" role="listbox">
          {suggest.items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === suggest.index}
                className={i === suggest.index ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
              >
                {item.user && <Avatar user={item.user} size={24} />}
                {item.image && <img src={item.image} alt="" className="custom-emoji" />}
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`composer${recording ? " is-recording" : ""}`}>
        {replyTo && (
          <div className="reply-bar">
            <Reply size={14} />
            <span>
              Replying to <strong>{replyTo.author?.displayName}</strong>
              <span className="excerpt">{replyTo.body || "Attachment"}</span>
            </span>
            <IconButton size="sm" label="Cancel reply" onClick={() => s().setReplyTo(channel.id, null)}>
              <X size={14} />
            </IconButton>
          </div>
        )}

        {files.length > 0 && (
          <div className="upload-queue">
            {files.map((f) => (
              <div key={f.id} className={`upload-item ${f.status}`} title={f.error ?? f.name}>
                {f.preview ? (
                  <img src={f.preview} alt="" />
                ) : (
                  <span className="upload-file">
                    {f.file.type.startsWith("audio/") ? <Mic size={20} /> : <FileText size={20} />}
                    <span>{f.name}</span>
                    <small>{formatBytes(f.size)}</small>
                  </span>
                )}
                {f.status === "uploading" && (
                  <span className="upload-progress">
                    <span style={{ width: `${Math.round(f.progress * 100)}%` }} />
                  </span>
                )}
                {f.status === "error" && <span className="upload-error">Failed</span>}
                <button type="button" className="upload-remove" onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {recording ? (
          <VoiceRecorder state={recording} setState={setRecording} onDone={(file) => addFiles([file])} />
        ) : (
          <div className="composer-row">
            <IconButton label="Attach files" onClick={() => fileInput.current?.click()}>
              <Paperclip size={20} />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              ref={input}
              className="composer-input"
              rows={1}
              value={text}
              placeholder={placeholder}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => setTimeout(() => setSuggest(null), 120)}
              aria-label="Message"
              maxLength={4000}
            />
            <IconButton label="Emoji" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}>
              <Smile size={20} />
            </IconButton>
            <IconButton label="Create poll" onClick={() => s().openModal("poll", { channelId: channel.id })}>
              <BarChart3 size={20} />
            </IconButton>
            <IconButton label="Games & fun" onClick={(e) => setGames(e.currentTarget.getBoundingClientRect())}>
              <Gamepad2 size={20} />
            </IconButton>
            {canRecordAudio() && !text.trim() && ready.length === 0 ? (
              <IconButton label="Record voice note" onClick={() => setRecording({ phase: "starting" })}>
                <Mic size={20} />
              </IconButton>
            ) : (
              <button type="button" className="send-btn" onClick={send} disabled={!canSend} aria-label="Send message" title={uploading ? "Waiting for uploads…" : "Send (Enter)"}>
                <SendHorizontal size={19} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="composer-hint">
        <b>Enter</b> to send · <b>Shift + Enter</b> for a new line · type <b>/</b> for bot commands, <b>@</b> to mention someone
      </div>

      {picker && <EmojiPicker anchor={picker} onPick={insertEmoji} onClose={() => setPicker(null)} align="end" />}

      <Popover anchor={games} onClose={() => setGames(null)} align="end">
        <div className="menu-label">Games & fun</div>
        <MenuItem icon={Swords} onClick={() => { setGames(null); s().openModal("chessChallenge", { channelId: channel.id }); }}>
          Play chess with someone
        </MenuItem>
        {channel.kind !== "dm" && (
          <MenuItem icon={VenetianMask} onClick={() => { setGames(null); s().openModal("imposterCreate", { channelId: channel.id }); }}>
            Play Imposter (group game)
          </MenuItem>
        )}
        {channel.kind !== "dm" && (
          <MenuItem icon={Link2} onClick={() => { setGames(null); s().openModal("wordChainCreate", { channelId: channel.id }); }}>
            Play Word Chain
          </MenuItem>
        )}
        <MenuItem icon={Disc3} onClick={() => { setGames(null); s().openModal("pick", { channelId: channel.id }); }}>
          Random picker (spin the wheel)
        </MenuItem>
        <MenuItem icon={Trophy} onClick={() => { setGames(null); s().sendMessage(channel.id, { body: "/awards" }); }}>
          {staff ? "Post this week's awards" : "See this week's awards"}
        </MenuItem>
        <MenuItem icon={Smile} onClick={() => { setGames(null); s().openModal("classEmoji", { classId: channel.classId }); }}>
          Class emoji
        </MenuItem>
        <div className="menu-sep" />
        <MenuItem icon={Dices} onClick={() => { setGames(null); s().sendMessage(channel.id, { body: "/roll 1d6" }); }}>
          Roll a die
        </MenuItem>
      </Popover>
    </div>
  );
}

/** Records audio with MediaRecorder and hands back a File. */
function VoiceRecorder({ state, setState, onDone }) {
  const rec = useRef(null);
  const chunks = useRef([]);
  const started = useRef(0);
  const cancelled = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    let stream;
    let timer;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickAudioMime();
        const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        rec.current = r;
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (cancelled.current) return;
          const type = r.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const file = new File(chunks.current, `voice-note-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`, { type });
          file.duration = (Date.now() - started.current) / 1000;
          onDone(file);
        };
        r.start(250);
        started.current = Date.now();
        timer = setInterval(() => {
          const sec = (Date.now() - started.current) / 1000;
          setElapsed(sec);
          if (sec >= 300) r.state === "recording" && r.stop(); // 5 min cap
        }, 200);
        setState({ phase: "recording" });
      } catch {
        toast("Can't use the microphone. Allow microphone access in your browser settings.", "error");
        setState(null);
      }
    })();
    return () => {
      clearInterval(timer);
      if (rec.current?.state === "recording") {
        cancelled.current = true;
        rec.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = (cancel) => {
    cancelled.current = cancel;
    if (rec.current?.state === "recording") rec.current.stop();
    setState(null);
  };

  return (
    <div className="recorder">
      <IconButton label="Cancel recording" onClick={() => stop(true)}>
        <Trash2 size={18} />
      </IconButton>
      <span className="rec-dot" />
      <span className="rec-time">{state.phase === "starting" ? "Starting mic…" : formatDuration(elapsed)}</span>
      <span className="rec-label">Recording… press the square to stop</span>
      <button type="button" className="send-btn" onClick={() => stop(false)} aria-label="Stop recording" disabled={state.phase !== "recording"}>
        <Square size={16} />
      </button>
    </div>
  );
}
