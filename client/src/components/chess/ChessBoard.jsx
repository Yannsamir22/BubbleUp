import { Chess } from "chess.js";
import { memo, useMemo, useState } from "react";
import { PIECE_NAMES as NAMES, Piece } from "./pieces.jsx";
const FILES = "abcdefgh";

/**
 * Interactive chess board.
 *  - `myColor` ("w" | "b" | null): which pieces the viewer may move (null = watch only)
 *  - `onMove(from, to, promotion)`: called for legal moves only
 */
export const ChessBoard = memo(function ChessBoard({
  fen,
  orientation = "white",
  myColor = null,
  lastMove,
  onMove,
  size,
}) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState(null);
  const [promotion, setPromotion] = useState(null); // { from, to }
  const canMove = myColor && game.turn() === myColor && !game.isGameOver();

  const targets = useMemo(() => {
    if (!selected || !canMove) return new Map();
    return new Map(
      game.moves({ square: selected, verbose: true }).map((m) => [m.to, m]),
    );
  }, [game, selected, canMove]);

  const checkSquare = useMemo(() => {
    if (!game.inCheck()) return null;
    for (const row of game.board())
      for (const sq of row)
        if (sq && sq.type === "k" && sq.color === game.turn()) return sq.square;
    return null;
  }, [game]);

  function tryMove(from, to) {
    const move = game
      .moves({ square: from, verbose: true })
      .find((m) => m.to === to);
    if (!move) return false;
    if (move.flags.includes("p")) setPromotion({ from, to });
    else onMove?.(from, to);
    setSelected(null);
    return true;
  }

  function onSquare(square) {
    if (!canMove) return;
    const piece = game.get(square);
    if (selected && targets.has(square)) return tryMove(selected, square);
    if (piece && piece.color === myColor)
      setSelected(square === selected ? null : square);
    else setSelected(null);
  }

  const ranks =
    orientation === "white"
      ? [8, 7, 6, 5, 4, 3, 2, 1]
      : [1, 2, 3, 4, 5, 6, 7, 8];
  const files =
    orientation === "white" ? FILES.split("") : FILES.split("").reverse();

  return (
    <div
      className={`chessboard${canMove ? " can-move" : ""}`}
      style={size ? { width: size } : undefined}
      role="grid"
      aria-label="Chess board"
    >
      {ranks.map((rank, ri) =>
        files.map((file, fi) => {
          const square = `${file}${rank}`;
          const piece = game.get(square);
          const dark = (FILES.indexOf(file) + rank) % 2 === 0;
          const cls = [
            "sq",
            dark ? "dark" : "light",
            selected === square && "selected",
            lastMove &&
              (lastMove.from === square || lastMove.to === square) &&
              "last",
            checkSquare === square && "check",
            targets.has(square) && (piece ? "capture" : "target"),
          ]
            .filter(Boolean)
            .join(" ");
          const mine = piece && piece.color === myColor && canMove;
          return (
            <button
              key={square}
              type="button"
              className={cls}
              onClick={() => onSquare(square)}
              onDragOver={(e) => targets.has(square) && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (selected) tryMove(selected, square);
              }}
              aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${NAMES[piece.type]}` : ""}`}
              tabIndex={canMove ? 0 : -1}
            >
              {piece && (
                <span
                  className="piece-wrap"
                  draggable={!!mine}
                  onDragStart={(e) => {
                    setSelected(square);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <Piece type={piece.type} color={piece.color} />
                </span>
              )}
              {fi === 0 && <span className="coord rank">{rank}</span>}
              {ri === 7 && <span className="coord file">{file}</span>}
            </button>
          );
        }),
      )}

      {promotion && (
        <div
          className="promotion"
          role="dialog"
          aria-label="Choose promotion piece"
        >
          <span>Promote to</span>
          {["q", "r", "b", "n"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onMove?.(promotion.from, promotion.to, p);
                setPromotion(null);
              }}
              aria-label={NAMES[p]}
            >
              <Piece type={p} color={myColor} />
            </button>
          ))}
          <button
            type="button"
            className="promotion-cancel"
            onClick={() => setPromotion(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
});

/** Human-readable status line for a game, from the viewer's point of view. */
export function chessStatus(game, meId) {
  const meWhite = game.white.id === meId;
  const meBlack = game.black.id === meId;
  const playing = meWhite || meBlack;
  const nameOf = (color) =>
    game[color].id === meId ? "You" : game[color].displayName;
  switch (game.status) {
    case "pending":
      return game.opponentId === meId
        ? `${(meWhite ? game.black : game.white).displayName} challenged you`
        : `Waiting for ${(game.white.id === game.opponentId ? game.white : game.black).displayName} to accept`;
    case "declined":
      return "Challenge declined";
    case "cancelled":
      return "Challenge cancelled";
    case "active": {
      const toMove = game[game.turn];
      if (playing && toMove.id === meId)
        return game.check ? "Your move — you're in check!" : "Your move";
      return `${toMove.displayName} to move${game.check ? " (in check)" : ""}`;
    }
    case "finished": {
      const why =
        {
          checkmate: "by checkmate",
          resign: "by resignation",
          stalemate: "stalemate",
          repetition: "threefold repetition",
          insufficient: "not enough pieces",
          fifty: "50-move rule",
        }[game.reason] ?? "";
      if (game.result === "draw") return `Draw (${why})`;
      const winner = nameOf(game.result);
      return `${winner} won ${why}`;
    }
    default:
      return "";
  }
}
