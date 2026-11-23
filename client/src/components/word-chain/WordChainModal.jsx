import { useEffect, useState } from "react";
import { Link2, Timer, Trophy } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Avatar, Button, Modal, Spinner } from "../ui/primitives.jsx";
import { LANGUAGE_LABELS, Lives, eventText, nextLetter, useTurnTimer } from "./shared.jsx";

const EMPTY_MEMBERS = {};

export function WordChainModal({ gameId, onClose }) {
  const game = useStore((s) => s.wordChains[gameId]);
  const meId = useStore((s) => s.me?.id);
  const members = useStore((s) => s.details[s.wordChains[gameId]?.classId]?.members ?? EMPTY_MEMBERS);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const seconds = useTurnTimer(game);
  const s = useStore.getState;

  useEffect(() => {
    s().loadWordChain(gameId).catch((err) => {
      s().toast(err.message, "error");
      onClose();
    });
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) {
    return <Modal title="Word Chain" onClose={onClose}><Spinner /></Modal>;
  }

  const lives = game.lives ?? {};
  const maxLives = game.maxLives ?? 3;
  const inGame = game.players.some((player) => player.id === meId);
  const stillIn = inGame && (lives[meId] ?? 0) > 0;
  const canManage = game.host.id === meId || ["teacher", "owner"].includes(members[meId]?.role);
  const myTurn = game.status === "playing" && game.turnUserId === meId;
  const currentPlayer = game.players.find((player) => player.id === game.turnUserId);
  const letter = nextLetter(game);
  const event = eventText(game, meId);
  const hurry = seconds !== null && seconds <= 5;

  async function act(action, body) {
    setBusy(true);
    try {
      await s().wordChainAction(gameId, action, body);
    } catch (err) {
      s().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const value = word.trim();
    if (!value) return;
    setBusy(true);
    try {
      await s().wordChainAction(gameId, "play", { word: value });
      setWord("");
    } catch (err) {
      s().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function giveUp() {
    if (window.confirm("Give up? You'll be out of this game.")) act("forfeit");
  }

  return (
    <Modal title="Word Chain" subtitle={`Hosted by ${game.host.displayName} · ${LANGUAGE_LABELS[game.language] ?? "English"} words`} onClose={onClose} wide>
      <div className="word-chain-layout">
        <main className="word-chain-main">
          <div className="word-chain-status-row">
            <p className={`word-chain-status${myTurn ? " mine" : ""}`} aria-live="polite">
              {game.status === "lobby" && `Waiting for players · ${game.players.length}/${game.maxPlayers}`}
              {game.status === "playing" && (myTurn ? `Your turn — start with ${letter ?? "any letter"}` : `${currentPlayer?.displayName ?? "A player"} is thinking…`)}
              {game.status === "finished" && (game.winner ? (game.winner.id === meId ? "You win! 🎉" : `${game.winner.displayName} wins!`) : "The game is over.")}
              {game.status === "cancelled" && "The game was cancelled."}
            </p>
            {seconds !== null && (
              <span className={`word-chain-timer${hurry ? " hurry" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
                <Timer size={14} /> {seconds}s
              </span>
            )}
          </div>

          {event && <p className="word-chain-event" role="status">{event}</p>}

          {game.status === "finished" && game.winner && (
            <p className="word-chain-winner">
              <Trophy size={18} /> <Avatar user={game.winner} size={24} /> <strong>{game.winner.displayName}</strong> is the last player standing.
            </p>
          )}

          {game.status === "lobby" && !inGame && (
            <Button variant="primary" loading={busy} onClick={() => act("join")}>Join the game</Button>
          )}
          {game.status === "lobby" && inGame && game.host.id !== meId && (
            <Button variant="ghost" disabled={busy} onClick={() => act("leave")}>Leave the lobby</Button>
          )}
          {game.status === "playing" && inGame && !stillIn && <p className="muted">You're out. Watch the others finish the game!</p>}
          {myTurn && (
            <form className="word-chain-input" onSubmit={submit}>
              <input
                className="input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={letter ? `A word starting with ${letter}…` : "Choose the first word…"}
                aria-label="Your word"
                maxLength={40}
                autoComplete="off"
                autoFocus
                disabled={busy}
              />
              <Button variant="primary" type="submit" loading={busy} disabled={!word.trim()}>Play word</Button>
            </form>
          )}

          {game.chain.length > 0 ? (
            <ol className="word-chain-list" aria-label="Words played">
              {game.chain.map((entry, index) => (
                <li key={`${entry.userId}-${index}`}>
                  <span className="word-chain-number">{index + 1}</span>
                  <strong>{entry.word}</strong>
                  <span className="word-chain-author">
                    <Avatar user={entry.user ?? members[entry.userId]} size={20} />
                    {entry.userId === meId ? "You" : entry.user?.displayName ?? members[entry.userId]?.displayName ?? "Player"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No words yet. The first player can choose any word from the list.</p>
          )}
        </main>

        <aside className="word-chain-side">
          <div className="word-chain-player-list">
            <strong>Players ({game.players.length}/{game.maxPlayers})</strong>
            {game.players.map((player) => {
              const out = game.status !== "lobby" && (lives[player.id] ?? 0) === 0;
              return (
                <span
                  key={player.id}
                  className={`word-chain-player${game.status === "playing" && player.id === game.turnUserId ? " turn" : ""}${out ? " out" : ""}`}
                >
                  <Avatar user={player} size={26} />
                  <span>{player.id === meId ? "You" : player.displayName}</span>
                  {player.id === game.host.id && <small>host</small>}
                  {out ? <small className="word-chain-out">out</small> : <Lives count={lives[player.id] ?? maxLives} max={maxLives} />}
                </span>
              );
            })}
          </div>
          {canManage && game.status === "lobby" && (
            <Button variant="primary" loading={busy} disabled={game.players.length < game.minPlayers} onClick={() => act("start")}>
              {game.players.length < game.minPlayers ? `Need ${game.minPlayers - game.players.length} more` : "Start the game"}
            </Button>
          )}
          {game.status === "playing" && stillIn && (
            <Button variant="ghost" disabled={busy} onClick={giveUp}>Give up</Button>
          )}
          {canManage && game.status === "playing" && (
            <Button variant="outline" disabled={busy} onClick={() => act("finish")}>Finish the game</Button>
          )}
          <div className="word-chain-rules">
            <Link2 size={16} />
            <span>
              Play a word from the {LANGUAGE_LABELS[game.language] ?? "English"} list that starts with the previous word's last letter and hasn't been used.
              A wrong word or running out of time ({game.turnSeconds ?? 30}s) costs a life. Lose all {maxLives} and you're out.
            </span>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
