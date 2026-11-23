import { useState } from "react";
import { Link2 } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Avatar, Button } from "../ui/primitives.jsx";
import { Lives, nextLetter, useTurnTimer } from "./shared.jsx";

export function WordChainCard({ initial }) {
  const live = useStore((s) => s.wordChains[initial.id]);
  const game = live && live.version >= initial.version ? live : initial;
  const meId = useStore((s) => s.me?.id);
  const role = useStore((s) => s.details[game.classId]?.members?.[s.me?.id]?.role);
  const canManage = game.host.id === meId || ["teacher", "owner"].includes(role);
  const [busy, setBusy] = useState(false);
  const s = useStore.getState;
  const inGame = game.players.some((player) => player.id === meId);
  const myTurn = game.status === "playing" && game.turnUserId === meId;
  const currentPlayer = game.players.find((player) => player.id === game.turnUserId);
  const letter = nextLetter(game);
  const seconds = useTurnTimer(game);
  const lives = game.lives ?? {};
  const maxLives = game.maxLives ?? 3;

  async function act(action) {
    setBusy(true);
    try {
      await s().wordChainAction(game.id, action);
      return true;
    } catch (err) {
      s().toast(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (await act("start")) open();
  }

  function open() {
    s().openModal("wordChain", { gameId: game.id });
  }

  const status =
    game.status === "lobby"
      ? `${game.players.length} joined · need ${Math.max(0, game.minPlayers - game.players.length)} more`
      : game.status === "playing"
        ? myTurn
          ? `Your turn · start with ${letter ?? "any letter"}${seconds !== null ? ` · ${seconds}s` : ""}`
          : `Waiting for ${currentPlayer?.displayName ?? "the next player"}`
        : game.status === "finished"
          ? game.winner
            ? `${game.winner.id === meId ? "You win" : `${game.winner.displayName} wins`} 🏆`
            : "Game finished"
          : "Game cancelled";

  return (
    <div className={`word-chain-card${myTurn ? " my-turn" : ""}`}>
      <div className="word-chain-card-head">
        <Link2 size={16} />
        <strong>Word Chain</strong>
        <span className="word-chain-card-status">{status}</span>
      </div>
      {game.players.length > 0 && (
        <div className="word-chain-players">
          {game.players.map((player) => (
            <span
              key={player.id}
              className={`word-chain-player${player.id === game.turnUserId && game.status === "playing" ? " turn" : ""}${game.status !== "lobby" && (lives[player.id] ?? 0) === 0 ? " out" : ""}`}
            >
              <Avatar user={player} size={22} />
              <span>{player.id === meId ? "You" : player.displayName}</span>
              {game.status === "playing" && (lives[player.id] ?? 0) > 0 && <Lives count={lives[player.id]} max={maxLives} />}
            </span>
          ))}
        </div>
      )}
      {game.chain.length > 0 && (
        <p className="word-chain-preview">
          {game.chain.slice(-5).map((entry, index) => (
            <span key={`${entry.userId}-${index}`}>{entry.word}</span>
          ))}
        </p>
      )}
      <div className="word-chain-actions">
        {game.status === "lobby" && !inGame && (
          <Button size="sm" variant="primary" loading={busy} onClick={() => act("join")}>Join the game</Button>
        )}
        {game.status === "lobby" && inGame && !canManage && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("leave")}>Leave</Button>
        )}
        {game.status === "lobby" && canManage && (
          <>
            <Button size="sm" variant="primary" loading={busy} disabled={game.players.length < game.minPlayers} onClick={start}>
              {game.players.length < game.minPlayers ? "Waiting for a player" : "Start the game"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("cancel")}>Cancel</Button>
          </>
        )}
        {game.status === "playing" && (
          <Button size="sm" variant={myTurn ? "primary" : "outline"} onClick={open}>
            {myTurn ? "It's your turn!" : "Open game"}
          </Button>
        )}
        {(game.status === "finished" || game.status === "cancelled") && (
          <Button size="sm" variant="outline" onClick={open}>See the game</Button>
        )}
      </div>
    </div>
  );
}
