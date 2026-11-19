import { useEffect, useState } from "react";
import { findChannel, useStore } from "../../store/index.js";
import { Button, Modal } from "../ui/primitives.jsx";

/** Start an Imposter lobby in a channel: either play with a random word, or type the word and run the game. */
export function ImposterCreateModal({ channelId, onClose }) {
  const channel = useStore((s) => findChannel(s, channelId));
  const categories = useStore((s) => s.imposterCategories) ?? [];
  const [mode, setMode] = useState("random");
  const [category, setCategory] = useState("any");
  const [custom, setCustom] = useState({ category: "", word: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = useStore.getState;

  useEffect(() => {
    s().loadImposterCategories().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!channel) return null;
  const valid = mode === "random" || (custom.category.trim() && custom.word.trim());

  async function create() {
    setBusy(true);
    setError("");
    try {
      const opts =
        mode === "random"
          ? { mode, category: category === "any" ? undefined : category }
          : { mode, category: custom.category.trim(), word: custom.word.trim() };
      await s().createImposter(channel.id, opts);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Play Imposter"
      subtitle={`Everyone gets a secret word except one player: the imposter. Give clues, then vote to find them. The game card appears in #${channel.name}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} loading={busy} disabled={!valid}>Post the game</Button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">Who picks the secret word?</span>
        <div className="segmented">
          <button type="button" className={mode === "random" ? "active" : ""} onClick={() => setMode("random")}>
            Random word (I play)
          </button>
          <button type="button" className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>
            I choose it (I run the game)
          </button>
        </div>
      </div>

      {mode === "random" ? (
        <div className="field">
          <span className="field-label">Category</span>
          <div className="imp-cats">
            {["any", ...categories].map((c) => (
              <button key={c} type="button" className={`imp-cat${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
                {c === "any" ? "Surprise me" : c}
              </button>
            ))}
          </div>
          <span className="field-hint">Everyone sees the category. The word is picked at random when you post.</span>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Category (everyone sees it)</span>
            <input className="input" value={custom.category} onChange={(e) => setCustom({ ...custom, category: e.target.value })} placeholder="e.g. Planets" maxLength={40} />
          </label>
          <label className="field">
            <span className="field-label">Secret word</span>
            <input className="input" value={custom.word} onChange={(e) => setCustom({ ...custom, word: e.target.value })} placeholder="e.g. Saturn" maxLength={40} autoComplete="off" />
            <span className="field-hint">Since you know the word, you don't play. You can start, skip turns and end the game.</span>
          </label>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
