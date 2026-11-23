import { Check, Eye, EyeOff, Radio, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../../hooks/useRealtime.js";
import { playPop } from "../../lib/browser.js";
import { useStore } from "../../store/index.js";
import { Avatar, Button, Modal, Spinner } from "../ui/primitives.jsx";
import { imposterStatus } from "./ImposterCard.jsx";

/**
 * Keeps this game live while it's open: joins its watch room (so others see who's watching),
 * takes the snapshot from the reply, and rejoins after a reconnect.
 */
function useWatchImposter(gameId) {
  useEffect(() => {
    const st = useStore.getState;
    const socket = getSocket();
    if (!socket) return;
    const join = () =>
      socket.emit("imposter:watch", { gameId }, (res) => {
        if (res?.ok) st().onImposterUpdate(res);
      });
    if (socket.connected) join();
    socket.on("connect", join);
    return () => {
      socket.off("connect", join);
      socket.emit("imposter:unwatch", { gameId });
    };
  }, [gameId]);
}

const REASONS = {
  guessed: "The imposter team guessed the word.",
  caught: "The imposter team was caught and didn't guess the word.",
  no_guess: "The caught imposter ran out of time to guess for the team.",
  wrong_vote: "The class voted for the wrong person.",
  tie: "The vote was a tie, so the imposter slipped away.",
  no_votes: "Nobody voted, so the imposter slipped away.",
};

/** The secret card. Hidden until tapped, so classmates looking at your screen don't see it. */
function RoleCard({ game, me }) {
  const [shown, setShown] = useState(false);
  if (!me || game.status === "cancelled" || game.status === "finished") return null;
  if (me.role === "spectator") {
    return (
      <div className="imp-role watch">
        <strong>You're watching</strong>
        <span>The secret word and the imposter stay hidden until the end, so nobody can give them away.</span>
      </div>
    );
  }
  if (game.status === "lobby" && me.role === "player") {
    return (
      <div className="imp-role">
        <strong>You're in!</strong>
        <span>When the game starts, your secret card appears here.</span>
      </div>
    );
  }
  const secret =
    me.role === "imposter" ? (
      <>
        <strong className="imp-role-big">You are the imposter</strong>
        <span>
          You don't know the word. The category is <b>{game.category}</b>. Listen to the clues and blend in.
        </span>
      </>
    ) : (
      <>
        <span className="imp-role-label">{me.role === "host" ? "You're the game master. The secret word:" : "The secret word:"}</span>
        <strong className="imp-role-big">{me.word}</strong>
        {me.role === "player" && <span>One player doesn't know it. Prove you do, without making it too easy.</span>}
      </>
    );
  return (
    <div className={`imp-role${me.role === "imposter" ? " player" : " player"}`}>
      {shown ? secret : <span>Make sure nobody is looking at your screen.</span>}
      <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />} {shown ? "Hide my card" : "Show my card"}
      </Button>
    </div>
  );
}

/** Rows = players in turn order, columns = rounds. The cell being waited on is highlighted. */
function ClueBoard({ game, meId }) {
  const rounds = Array.from({ length: game.rounds }, (_, i) => i + 1);
  const cell = (playerId, round) => game.clues.find((c) => c.userId === playerId && c.round === round);
  const votesFor = (id) => game.votes.filter((v) => v.targetId === id).length;
  const showVotes = game.votes.length > 0;
  const revealedImposters = new Set(game.imposterIds ?? []);
  return (
    <table className="imp-board">
      <thead>
        <tr>
          <th>Player</th>
          {rounds.map((r) => (
            <th key={r}>Round {r}</th>
          ))}
          {game.status === "voting" && <th>Voted</th>}
          {showVotes && <th>Votes</th>}
        </tr>
      </thead>
      <tbody>
        {game.players.map((p) => (
          <tr key={p.id} className={revealedImposters.has(p.id) || game.imposterId === p.id ? "is-imposter" : ""}>
            <td className="imp-board-name">
              <Avatar user={p} size={22} />
              <span>{p.id === meId ? "You" : p.displayName}</span>
              {(revealedImposters.has(p.id) || game.imposterId === p.id) && <span className="imp-chip danger">imposter</span>}
            </td>
            {rounds.map((r) => {
              const c = cell(p.id, r);
              const waiting = game.status === "clues" && game.round === r && game.turnUserId === p.id;
              return (
                <td key={r} className={waiting ? "waiting" : c?.skipped ? "skipped" : ""}>
                  {c ? (c.skipped ? "skipped" : c.text) : waiting ? "thinking…" : ""}
                </td>
              );
            })}
            {game.status === "voting" && <td>{game.votedUserIds.includes(p.id) ? <Check size={15} aria-label="voted" /> : ""}</td>}
            {showVotes && <td className="imp-board-votes">{votesFor(p.id) || ""}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TextAction({ label, placeholder, maxLength, onSubmit }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch (err) {
      useStore.getState().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="imp-input" onSubmit={submit}>
      <input ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={maxLength} aria-label={label} autoComplete="off" />
      <Button variant="primary" type="submit" loading={busy} disabled={!text.trim()}>
        {label}
      </Button>
    </form>
  );
}

/** Full game screen for players, the game master and spectators. */
export function ImposterModal({ gameId, onClose }) {
  const game = useStore((s) => s.imposter[gameId]);
  const me = useStore((s) => s.imposterMe[gameId]);
  const watchers = useStore((s) => s.imposterWatchers[gameId]) ?? [];
  const meId = useStore((s) => s.me.id);
  const members = useStore((s) => (game ? s.details[s.activeClassId]?.members : null));
  const sound = useStore((s) => s.settings.sound);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const s = useStore.getState;
  const clueCount = useRef(game?.clues.length ?? 0);

  useWatchImposter(gameId);
  useEffect(() => {
    s().loadImposter(gameId).catch((err) => {
      s().toast(err.message, "error");
      onClose();
    });
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A little sound when a clue lands.
  useEffect(() => {
    if (!game) return;
    if (game.clues.length > clueCount.current && sound) playPop();
    clueCount.current = game.clues.length;
  }, [game, sound]);

  if (!game) {
    return (
      <Modal title="Imposter" onClose={onClose}>
        <Spinner />
      </Modal>
    );
  }

  const act = (action, body) => s().imposterAction(game.id, action, body);
  const safe = (action, body) => () => act(action, body).catch((err) => s().toast(err.message, "error"));
  const inGame = game.players.some((p) => p.id === meId);
  const canManage = game.host.id === meId || ["teacher", "owner"].includes(members?.[meId]?.role);
  const live = ["clues", "voting", "guess"].includes(game.status);
  const playerIds = new Set(game.players.map((p) => p.id));
  const audience = watchers.filter((id) => !playerIds.has(id) && id !== game.host.id);
  const myVote = me?.vote ?? null; // others' votes stay hidden until everyone has voted
  const advanceLabel = { clues: "Skip this turn", voting: "Close voting now", guess: "End the guess" }[game.status];
  const turnName = game.players.find((p) => p.id === game.turnUserId)?.displayName;
  const imposter = game.players.find((p) => p.id === game.imposterId);
  const revealedImposters = (game.imposterIds ?? []).map((id) => game.players.find((p) => p.id === id)).filter(Boolean);

  return (
    <Modal title={`Imposter · ${game.category}`} onClose={onClose} wide>
      <div className="imp-layout">
        <div className="imp-main">
          <RoleCard game={game} me={me} />
          <p className={`imp-status${game.turnUserId === meId ? " mine" : ""}`}>{imposterStatus(game, meId)}</p>

          {game.status === "clues" && game.turnUserId === meId && (
            <TextAction label="Give clue" placeholder="One to three words…" maxLength={30} onSubmit={(text) => act("clue", { text })} />
          )}
          {game.status === "clues" && game.turnUserId !== meId && <p className="muted">Waiting for {turnName ?? "the next player"}…</p>}

          {game.status === "voting" && inGame && (
            <div className="imp-vote">
              <span className="field-label">{game.votedUserIds.includes(meId) ? "You voted. You can still change your mind:" : "Who is the imposter?"}</span>
              <div className="imp-vote-grid">
                {game.players
                  .filter((p) => p.id !== meId)
                  .map((p) => (
                    <button key={p.id} type="button" className={`imp-vote-btn${myVote === p.id ? " active" : ""}`} onClick={safe("vote", { targetId: p.id })}>
                      <Avatar user={p} size={28} />
                      <span>{p.displayName}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {game.status === "guess" && game.imposterId === meId && (
            <TextAction label="Guess" placeholder={`Your guess (${game.category})…`} maxLength={40} onSubmit={(text) => act("guess", { text })} />
          )}

          {game.status === "finished" && (
            <div className={`imp-result ${game.result}`}>
              <strong>
                {game.result === "imposter"
                  ? `The imposter${game.imposterCount > 1 ? "s" : ""} win!`
                  : "The players win!"}
              </strong>
              <span>
                {revealedImposters.length > 1 ? "The imposters were " : "The imposter was "}
                <b>{(revealedImposters.length ? revealedImposters : [imposter].filter(Boolean)).map((p) => p.id === meId ? "you" : p.displayName).join(", ")}</b>
                {" "}and the word was <b>{game.word}</b>. {REASONS[game.reason]}
              </span>
              {game.guess && <span className="muted">Their guess: “{game.guess}”</span>}
            </div>
          )}
          {game.status === "cancelled" && (
            <div className="imp-result">
              <strong>Game cancelled</strong>
              {game.word && (
                <span>
                  The word was <b>{game.word}</b>
                  {imposter ? (
                    <>
                      {" "}and the imposter was <b>{imposter.displayName}</b>.
                    </>
                  ) : (
                    "."
                  )}
                </span>
              )}
            </div>
          )}

          {game.status === "lobby" ? (
            <div className="imp-lobby">
              <span className="field-label">
                Players ({game.players.length}/{game.maxPlayers}, at least {game.minPlayers})
              </span>
              <div className="imp-card-players">
                {game.players.map((p) => (
                  <span key={p.id} className="imp-card-player">
                    <Avatar user={p} size={24} />
                    <span>{p.id === meId ? "You" : p.displayName}</span>
                  </span>
                ))}
              </div>
              {!inGame && !(game.host.id === meId && !game.hostPlays) && (
                <div>
                  <Button variant="primary" onClick={safe("join")}>Join the game</Button>
                </div>
              )}
            </div>
          ) : (
            <ClueBoard game={game} meId={meId} />
          )}
        </div>

        <aside className="imp-side">
          {live && (
            <p className="imp-live">
              <Radio size={14} /> LIVE
              <span className="muted">
                {" "}· {audience.length} watching
              </span>
            </p>
          )}
          {audience.length > 0 && (
            <div className="imp-watchers" aria-label="Watching">
              {audience.slice(0, 8).map((id) => (
                <Avatar key={id} user={members?.[id] ?? { id, displayName: "?" }} size={24} />
              ))}
              {audience.length > 8 && <span className="muted">+{audience.length - 8}</span>}
            </div>
          )}

          {canManage && game.status === "lobby" && (
            <Button variant="primary" onClick={safe("start")} disabled={game.players.length < game.minPlayers}>
              Start the game
            </Button>
          )}
          {canManage && live && (
            <Button size="sm" variant="outline" onClick={safe("advance")}>
              <SkipForward size={14} /> {advanceLabel}
            </Button>
          )}
          {canManage && (game.status === "lobby" || live) &&
            (confirmCancel ? (
              <span className="imp-confirm">
                Stop this game for everyone?
                <Button size="sm" variant="danger" onClick={safe("cancel")}>Yes, cancel</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>No</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>
                <X size={14} /> Cancel game
              </Button>
            ))}

          <div className="imp-rules">
            <strong>How to play</strong>
            <ol>
              <li>Everyone gets the secret word, except the imposter.</li>
              <li>In turn, each player gives a short clue. {game.rounds} rounds.</li>
              <li>Everyone votes for who they think the imposter is.</li>
              <li>Caught? The imposter can still win by guessing the word.</li>
            </ol>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
