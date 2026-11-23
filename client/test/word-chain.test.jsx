import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "../src/store/index.js";
import { api } from "../src/lib/api.js";
import { WordChainCard } from "../src/components/word-chain/WordChainCard.jsx";
import { WordChainModal } from "../src/components/word-chain/WordChainModal.jsx";

vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const ada = { id: 1, displayName: "Ada", username: "ada" };
const kofi = { id: 2, displayName: "Kofi", username: "kofi" };

function game(extra = {}) {
  return {
    id: 9,
    classId: 10,
    channelId: 100,
    host: ada,
    status: "playing",
    language: "en",
    turnSeconds: 30,
    maxLives: 3,
    players: [ada, kofi],
    lives: { 1: 3, 2: 3 },
    outOrder: [],
    turnDeadline: Date.now() + 30_000,
    serverTime: Date.now(),
    winner: null,
    lastEvent: null,
    minPlayers: 2,
    maxPlayers: 10,
    chain: [],
    turnUserId: ada.id,
    version: 1,
    updatedAt: 1,
    ...extra,
  };
}

beforeEach(() => {
  useStore.setState({
    me: ada,
    details: { 10: { members: { 1: ada, 2: kofi } } },
    wordChains: {},
  });
  api.get.mockResolvedValue({ game: game() });
  api.post.mockResolvedValue({ game: game({ chain: [{ userId: ada.id, word: "apple", user: ada }], turnUserId: kofi.id, version: 2 }) });
});

describe("Word Chain", () => {
  it("shows the turn in the chat card and submits a word from the modal", async () => {
    useStore.setState({ wordChains: { 9: game() } });
    render(<WordChainCard initial={game()} />);
    expect(screen.getByText(/^Your turn · start with any letter · (29|30)s$/)).toBeInTheDocument();

    render(<WordChainModal gameId={9} onClose={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "Your word" });
    await userEvent.type(input, "apple");
    await userEvent.click(screen.getByRole("button", { name: "Play word" }));

    expect(api.post).toHaveBeenCalledWith("/word-chain/9/play", { word: "apple" });
    expect(await screen.findByText("Kofi is thinking…")).toBeInTheDocument();
  });

  it("shows the turn timer, lives, and a lost life after a wrong word", async () => {
    const toast = vi.fn();
    useStore.setState({ toast });
    api.post.mockResolvedValue({
      game: game({
        lives: { 1: 2, 2: 3 },
        turnUserId: kofi.id,
        version: 2,
        lastEvent: { type: "mistake", userId: ada.id, word: "blorp", detail: "“blorp” isn't in the English word list.", livesLeft: 2, eliminated: false },
      }),
      penalty: "“blorp” isn't in the English word list. You lost a life (2 left).",
    });
    render(<WordChainModal gameId={9} onClose={() => {}} />);
    expect(await screen.findByRole("timer")).toHaveTextContent(/(29|30)s/);
    expect(screen.getAllByLabelText("3 of 3 lives left")).toHaveLength(2);

    await userEvent.type(screen.getByRole("textbox", { name: "Your word" }), "blorp");
    await userEvent.click(screen.getByRole("button", { name: "Play word" }));

    expect(toast).toHaveBeenCalledWith("“blorp” isn't in the English word list. You lost a life (2 left).", "error");
    expect(await screen.findByText("“blorp” isn't in the English word list — you lose a life.")).toBeInTheDocument();
    expect(screen.getByLabelText("2 of 3 lives left")).toBeInTheDocument();
  });

  it("announces the winner when the other players are out", async () => {
    const over = game({ status: "finished", lives: { 1: 1, 2: 0 }, outOrder: [kofi.id], winner: ada, turnUserId: null, turnDeadline: null });
    api.get.mockResolvedValue({ game: over });
    useStore.setState({ wordChains: { 9: over } });
    render(<WordChainCard initial={over} />);
    expect(screen.getByText("You win 🏆")).toBeInTheDocument();

    render(<WordChainModal gameId={9} onClose={() => {}} />);
    expect(await screen.findByText("You win! 🎉")).toBeInTheDocument();
    expect(screen.getByText("out")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
