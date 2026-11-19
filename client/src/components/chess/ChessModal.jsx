import { useEffect, useRef, useState } from "react";
import { Flag, RefreshCw } from "lucide-react";
import { useStore } from "../../store/index.js";
import { playPop } from "../../lib/browser.js";
import { Avatar, Button, Modal, Spinner } from "../ui/primitives.jsx";
import { ChessBoard, chessStatus } from "./ChessBoard.jsx";

function PlayerBar({ user, color, active }) {
  return (
    <div className={`chess-bar${active ? " active" : ""}`}>
      <span className={`chess-dot ${color}`} />
      <Avatar user={user} size={26} />
      <strong>{user.displayName}</strong>
      {active && <span className="chess-turn">to move</span>}
    </div>
  );
}

/** Full-size board for playing or watching a game. */
export function ChessModal({ gameId, onClose }) {
  const game = useStore((s) => s.games[gameId]);
  const meId = useStore((s) => s.me.id);
  const sound = useStore((s) => s.settings.sound);
  const [flipped, setFlipped] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const s = useStore.getState;
  const moveCount = useRef(game?.moves.length ?? 0);

  useEffect(() => {
    s().loadGame(gameId).catch((err) => {
      s().toast(err.message, "error");
      onClose();
    });
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A little sound when a move lands.
  useEffect(() => {
    if (!game) return;
    if (game.moves.length > moveCount.current && sound) playPop();
    moveCount.current = game.moves.length;
  }, [game, sound]);

  if (!game) {
    return (
      <Modal title="Chess" onClose={onClose}>
        <Spinner />
      </Modal>
    );
  }

  const myColor = game.status === "active" ? (game.white.id === meId ? "w" : game.black.id === meId ? "b" : null) : null;
  const isPlayer = game.white.id === meId || game.black.id === meId;
  const baseOrientation = game.black.id === meId ? "black" : "white";
  const orientation = flipped ? (baseOrientation === "white" ? "black" : "white") : baseOrientation;
  const top = orientation === "white" ? "black" : "white";
  const bottom = orientation === "white" ? "white" : "black";

  async function move(from, to, promotion) {
    try {
      await s().chessAction(game.id, "move", { from, to, promotion });
    } catch (err) {
      s().toast(err.message, "error");
    }
  }

  const pairs = [];
  for (let i = 0; i < game.moves.length; i += 2) pairs.push([game.moves[i], game.moves[i + 1]]);

  return (
    <Modal title={`${game.white.displayName} vs ${game.black.displayName}`} onClose={onClose} wide>
      <div className="chess-layout">
        <div className="chess-main">
          <PlayerBar user={game[top]} color={top} active={game.status === "active" && game.turn === top} />
          <ChessBoard fen={game.fen} orientation={orientation} myColor={myColor} lastMove={game.lastMove} onMove={move} />
          <PlayerBar user={game[bottom]} color={bottom} active={game.status === "active" && game.turn === bottom} />
        </div>
        <aside className="chess-side">
          <p className={`chess-status${myColor && game[game.turn].id === meId ? " mine" : ""}`}>{chessStatus(game, meId)}</p>
          {!isPlayer && game.status === "active" && <p className="muted">You're watching. Only the two players can move.</p>}
          {myColor && game[game.turn].id === meId && <p className="muted">Click a piece, then click where it should go. You can also drag it.</p>}

          <ol className="chess-moves" aria-label="Moves">
            {pairs.length === 0 && <li className="muted">No moves yet. White starts.</li>}
            {pairs.map(([w, b], i) => (
              <li key={i}>
                <span className="n">{i + 1}.</span>
                <span>{w}</span>
                <span>{b ?? ""}</span>
              </li>
            ))}
          </ol>

          <div className="chess-actions">
            <Button size="sm" variant="ghost" onClick={() => setFlipped((v) => !v)}>
              <RefreshCw size={14} /> Flip board
            </Button>
            {isPlayer && game.status === "active" &&
              (confirmResign ? (
                <span className="chess-confirm">
                  Give up this game?
                  <Button size="sm" variant="danger" onClick={() => s().chessAction(game.id, "resign").catch((e) => s().toast(e.message, "error"))}>
                    Yes, resign
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                    No
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmResign(true)}>
                  <Flag size={14} /> Resign
                </Button>
              ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
