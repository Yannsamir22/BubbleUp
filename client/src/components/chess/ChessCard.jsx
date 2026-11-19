import { useState } from "react";
import { Swords } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Avatar, Button } from "../ui/primitives.jsx";
import { ChessBoard, chessStatus } from "./ChessBoard.jsx";

/** The chess card shown inside a message: players, a small board, status and next action. */
export function ChessCard({ initial }) {
  const live = useStore((s) => s.games[initial.id]);
  const game = live && live.updatedAt >= initial.updatedAt ? live : initial;
  const meId = useStore((s) => s.me.id);
  const [busy, setBusy] = useState(false);
  const s = useStore.getState;

  const act = (action) => async () => {
    setBusy(true);
    try {
      await s().chessAction(game.id, action);
      if (action === "accept") s().openModal("chess", { gameId: game.id });
    } catch (err) {
      s().toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const open = () => s().openModal("chess", { gameId: game.id });
  const isPlayer = game.white.id === meId || game.black.id === meId;
  const myTurn = game.status === "active" && game[game.turn].id === meId;
  const showBoard = game.status === "active" || game.status === "finished";

  return (
    <div className={`chess-card${myTurn ? " my-turn" : ""}`}>
      <div className="chess-card-head">
        <Swords size={16} />
        <strong>Chess</strong>
        <span className="chess-card-status">{chessStatus(game, meId)}</span>
      </div>
      <div className="chess-players">
        <span className="chess-player">
          <span className="chess-dot white" title="White" />
          <Avatar user={game.white} size={22} /> {game.white.displayName}
        </span>
        <span className="muted">vs</span>
        <span className="chess-player">
          <span className="chess-dot black" title="Black" />
          <Avatar user={game.black} size={22} /> {game.black.displayName}
        </span>
      </div>
      {showBoard && (
        <button type="button" className="chess-mini" onClick={open} aria-label="Open the game">
          <ChessBoard fen={game.fen} lastMove={game.lastMove} orientation={game.black.id === meId ? "black" : "white"} size={200} />
        </button>
      )}
      <div className="chess-card-actions">
        {game.status === "pending" && game.opponentId === meId && (
          <>
            <Button size="sm" variant="primary" loading={busy} onClick={act("accept")}>
              Accept and play
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={act("decline")}>
              Decline
            </Button>
          </>
        )}
        {game.status === "pending" && game.challengerId === meId && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={act("cancel")}>
            Cancel challenge
          </Button>
        )}
        {game.status === "active" && (
          <Button size="sm" variant={myTurn ? "primary" : "outline"} onClick={open}>
            {myTurn ? "Make your move" : isPlayer ? "Open game" : "Watch"}
          </Button>
        )}
        {game.status === "finished" && (
          <Button size="sm" variant="outline" onClick={open}>
            See the final position
          </Button>
        )}
      </div>
    </div>
  );
}
