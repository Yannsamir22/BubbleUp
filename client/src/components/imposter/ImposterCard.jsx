import { useState } from "react";
import { VenetianMask } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Avatar, Button } from "../ui/primitives.jsx";

const nameOf = (game, id, meId) => (id === meId ? "You" : game.players.find((p) => p.id === id)?.displayName ?? "Someone");

/** One line saying where the game is at, from this viewer's point of view. */
export function imposterStatus(game, meId) {
  switch (game.status) {
    case "lobby":
      return `Waiting for players · ${game.players.length}/${game.maxPlayers}`;
    case "clues":
      return game.turnUserId === meId
        ? `Your turn to give a clue (round ${game.round} of ${game.rounds})`
        : `${nameOf(game, game.turnUserId, meId)} is giving a clue (round ${game.round} of ${game.rounds})`;
    case "voting":
      return `Voting · ${game.votedUserIds.length} of ${game.players.length} voted`;
    case "guess":
      return game.imposterId === meId
        ? "You were caught! Guess for your team to win"
        : `${nameOf(game, game.imposterId, meId)} was caught and gets one guess for the imposter team`;
    case "finished":
      return game.result === "imposter"
        ? `The imposter${game.imposterCount > 1 ? "s" : ""} won`
        : "The players won";
    case "cancelled":
      return "Game cancelled";
    default:
      return "";
  }
}

/** The Imposter card shown inside a chat message: players, status and the next action. */
export function ImposterCard({ initial }) {
  const live = useStore((s) => s.imposter[initial.id]);
  const game = live && live.version >= initial.version ? live : initial;
  const meId = useStore((s) => s.me.id);
  const [busy, setBusy] = useState(false);
  const s = useStore.getState;

  const open = () => s().openModal("imposter", { gameId: game.id });
  const act = (action, then) => async () => {
    setBusy(true);
    try {
      await s().imposterAction(game.id, action);
      then?.();
    } catch (err) {
      s().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const isHost = game.host.id === meId;
  const inGame = game.players.some((p) => p.id === meId);
  const isMaster = isHost && !game.hostPlays;
  const playing = ["clues", "voting", "guess"].includes(game.status);
  const myTurn =
    (game.status === "clues" && game.turnUserId === meId) ||
    (game.status === "voting" && inGame && !game.votedUserIds.includes(meId)) ||
    (game.status === "guess" && game.imposterId === meId);
  const enough = game.players.length >= game.minPlayers;

  return (
    <div className={`imp-card${myTurn ? " my-turn" : ""}`}>
      <div className="imp-card-head">
        <VenetianMask size={16} />
        <strong>Imposter</strong>
        <span className="imp-chip">{game.category}</span>
        <span className="imp-card-status">{imposterStatus(game, meId)}</span>
      </div>

      <div className="imp-card-players">
        {game.players.map((p) => (
          <span key={p.id} className={`imp-card-player${game.turnUserId === p.id ? " turn" : ""}`} title={p.displayName}>
            <Avatar user={p} size={24} />
            <span>{p.id === meId ? "You" : p.displayName}</span>
          </span>
        ))}
        {game.players.length === 0 && <span className="muted">Nobody has joined yet.</span>}
      </div>
      {isMaster && <p className="imp-card-note">You picked the word, so you run this game without playing.</p>}

      <div className="imp-card-actions">
        {game.status === "lobby" && !inGame && !isMaster && (
          <Button size="sm" variant="primary" loading={busy} onClick={act("join")}>
            Join the game
          </Button>
        )}
        {game.status === "lobby" && inGame && !isHost && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={act("leave")}>
            Leave
          </Button>
        )}
        {game.status === "lobby" && isHost && (
          <>
            <Button size="sm" variant="primary" loading={busy} disabled={!enough} onClick={act("start", open)} title={enough ? undefined : `Needs ${game.minPlayers} players`}>
              {enough ? "Start the game" : `Waiting for ${game.minPlayers - game.players.length} more`}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={act("cancel")}>
              Cancel
            </Button>
          </>
        )}
        {playing && (
          <Button size="sm" variant={myTurn ? "primary" : "outline"} onClick={open}>
            {myTurn ? "It's your turn!" : inGame || isMaster ? "Open game" : "Watch live"}
          </Button>
        )}
        {(game.status === "finished" || (game.status === "cancelled" && game.word)) && (
          <Button size="sm" variant="outline" onClick={open}>
            See what happened
          </Button>
        )}
      </div>
    </div>
  );
}
