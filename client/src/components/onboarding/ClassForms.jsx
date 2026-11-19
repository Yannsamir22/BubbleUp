import { useState } from "react";
import { useStore } from "../../store/index.js";
import { chatPath, navigate } from "../../lib/router.js";
import { CLASS_EMOJIS } from "../../lib/fun.js";
import { Button } from "../ui/primitives.jsx";

export function JoinClassForm({ onDone }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const joinClass = useStore((s) => s.joinClass);
  const toast = useStore((s) => s.toast);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await joinClass(code.trim());
      const general = res.channels.find((c) => c.name === "general") ?? res.channels[0];
      if (res.promoted) toast("You're now a teacher in this class", "success");
      else if (res.joined) toast(`You joined ${res.class.name}`, "success");
      else toast("You're already in this class");
      onDone?.();
      navigate(chatPath(res.class.id, general?.id));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <input
        className="input input-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
        placeholder="ABC123"
        maxLength={12}
        aria-label="Invite code"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" block loading={busy} disabled={code.length < 4}>
        Join class
      </Button>
    </form>
  );
}

export function CreateClassForm({ onDone }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(CLASS_EMOJIS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const createClass = useStore((s) => s.createClass);
  const toast = useStore((s) => s.toast);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const classId = await createClass({ name: name.trim(), description: description.trim(), emoji });
      const d = useStore.getState().details[classId];
      const general = Object.values(d.channels).find((c) => c.name === "general");
      toast("Class created. Now share the code with your students.", "success");
      onDone?.();
      navigate(chatPath(classId, general?.id));
      useStore.getState().openModal("invite", { classId });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label className="field">
        <span className="field-label">Class name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Form 4B — Chemistry" maxLength={50} required />
      </label>
      <label className="field">
        <span className="field-label">Description <span className="muted">(optional)</span></span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Mr. Smith, Tuesdays & Thursdays" maxLength={200} />
      </label>
      <div className="field">
        <span className="field-label">Icon</span>
        <div className="emoji-row">
          {CLASS_EMOJIS.map((e) => (
            <button key={e} type="button" className={`emoji-choice${emoji === e ? " active" : ""}`} onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" block loading={busy} disabled={name.trim().length < 2}>
        Create class
      </Button>
    </form>
  );
}
