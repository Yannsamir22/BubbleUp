import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChessBoard, chessStatus } from "../src/components/chess/ChessBoard.jsx";
import { PickWheel } from "../src/components/chat/PickWheel.jsx";
import { Markdown } from "../src/lib/markdown.jsx";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ada = { id: 1, displayName: "Ada" };
const kofi = { id: 2, displayName: "Kofi" };

describe("<ChessBoard>", () => {
  it("lets the player to move make legal moves only", async () => {
    const onMove = vi.fn();
    render(<ChessBoard fen={START} myColor="w" onMove={onMove} />);
    await userEvent.click(screen.getByRole("button", { name: "e2, white pawn" }));
    await userEvent.click(screen.getByRole("button", { name: "e5" })); // illegal: ignored
    expect(onMove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "e2, white pawn" }));
    await userEvent.click(screen.getByRole("button", { name: "e4" }));
    expect(onMove).toHaveBeenCalledWith("e2", "e4");
  });

  it("ignores clicks from spectators and the side not to move", async () => {
    const onMove = vi.fn();
    const { rerender } = render(<ChessBoard fen={START} myColor={null} onMove={onMove} />);
    await userEvent.click(screen.getByRole("button", { name: "e2, white pawn" }));
    await userEvent.click(screen.getByRole("button", { name: "e4" }));
    rerender(<ChessBoard fen={START} myColor="b" onMove={onMove} />);
    await userEvent.click(screen.getByRole("button", { name: "e7, black pawn" }));
    await userEvent.click(screen.getByRole("button", { name: "e5" }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("asks which piece to promote to", async () => {
    const onMove = vi.fn();
    render(<ChessBoard fen="8/P6k/8/8/8/8/8/K7 w - - 0 1" myColor="w" onMove={onMove} />);
    await userEvent.click(screen.getByRole("button", { name: "a7, white pawn" }));
    await userEvent.click(screen.getByRole("button", { name: "a8" }));
    await userEvent.click(screen.getByRole("button", { name: "knight" }));
    expect(onMove).toHaveBeenCalledWith("a7", "a8", "n");
  });

  it("describes the game from the viewer's side", () => {
    const base = { white: ada, black: kofi, challengerId: 1, opponentId: 2 };
    expect(chessStatus({ ...base, status: "pending" }, 2)).toBe("Ada challenged you");
    expect(chessStatus({ ...base, status: "pending" }, 1)).toBe("Waiting for Kofi to accept");
    expect(chessStatus({ ...base, status: "active", turn: "white", check: false }, 1)).toBe("Your move");
    expect(chessStatus({ ...base, status: "active", turn: "white", check: true }, 3)).toBe("Ada to move (in check)");
    expect(chessStatus({ ...base, status: "finished", result: "black", reason: "checkmate" }, 2)).toBe("You won by checkmate");
    expect(chessStatus({ ...base, status: "finished", result: "draw", reason: "stalemate" }, 1)).toBe("Draw (stalemate)");
  });
});

describe("<PickWheel>", () => {
  it("shows the result straight away for an old pick", () => {
    render(<PickWheel meta={{ options: ["pizza", "pasta"], winner: 1 }} createdAt={Date.now() - 60_000} />);
    expect(screen.getByText("pasta", { selector: "strong" })).toBeInTheDocument();
  });

  it("spins first for a fresh pick", () => {
    render(<PickWheel meta={{ options: ["a", "b", "c"], winner: 0 }} createdAt={Date.now()} />);
    expect(screen.getByText("Spinning…")).toBeInTheDocument();
  });
});

describe("class emoji in messages", () => {
  const emojis = new Map([["party", "/api/emoji/1"]]);

  it("renders known :name: as images and leaves unknown ones as text", () => {
    const { container } = render(<Markdown text="yay :party: and :unknown:" emojis={emojis} />);
    const img = container.querySelector("img.custom-emoji");
    expect(img).toHaveAttribute("src", "/api/emoji/1");
    expect(container.textContent).toContain(":unknown:");
  });

  it("makes emoji-only messages big", () => {
    const { container } = render(<Markdown text=":party: :party:" emojis={emojis} />);
    expect(container.firstChild).toHaveClass("md-jumbo");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });
});
