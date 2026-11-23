import { useState } from "react";
import { findChannel, useStore } from "../../store/index.js";
import { Button, Modal } from "../ui/primitives.jsx";
import { LANGUAGE_LABELS } from "./shared.jsx";

const TURN_SECONDS = [15, 30, 45, 60];

export function WordChainCreateModal({ channelId, onClose }) {
  const channel = useStore((s) => findChannel(s, channelId));
  const [language, setLanguage] = useState("en");
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = useStore.getState;

  if (!channel) return null;

  async function create() {
    setBusy(true);
    setError("");
    try {
      await s().createWordChain(channel.id, { language, turnSeconds });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Play Word Chain"
      subtitle={`Start a lobby in #${channel.name}. Take turns adding a new word that starts with the last letter of the previous word.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={create}>Post the game</Button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">Word list</span>
        <div className="segmented">
          {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
            <button key={code} type="button" className={language === code ? "active" : ""} aria-pressed={language === code} onClick={() => setLanguage(code)}>
              {label}
            </button>
          ))}
        </div>
        <span className="field-hint">Words are checked against the built-in {LANGUAGE_LABELS[language]} list. Accents and plurals are fine.</span>
      </div>
      <div className="field">
        <span className="field-label">Time per turn</span>
        <div className="imp-cats">
          {TURN_SECONDS.map((n) => (
            <button key={n} type="button" className={`imp-cat${turnSeconds === n ? " active" : ""}`} aria-pressed={turnSeconds === n} onClick={() => setTurnSeconds(n)}>
              {n} seconds
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Everyone starts with 3 lives. You lose one for a word that isn't in the list, doesn't start with the right letter or was already used, and when your time runs out. Lose all three and you're out. The last player standing wins.
      </p>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
