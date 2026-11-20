import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "../src/store/index.js";
import { api } from "../src/lib/api.js";
import { ImposterCard } from "../src/components/imposter/ImposterCard.jsx";
import { ImposterCreateModal } from "../src/components/imposter/ImposterCreateModal.jsx";
import { ImposterModal } from "../src/components/imposter/ImposterModal.jsx";

vi.mock("../src/lib/api.js", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const ada = { id: 1, displayName: "Ada", username: "ada" };
const kofi = { id: 2, displayName: "Kofi", username: "kofi" };
const li = { id: 3, displayName: "Li", username: "li" };
const sam = { id: 4, displayName: "Sam", username: "sam" };

const game = (extra = {}) => ({
  id: 9, channelId: 100, messageId: 50, host: ada, hostPlays: true, status: "clues", category: "Food",
  players: [ada, kofi, li], minPlayers: 3, maxPlayers: 10, rounds: 2, round: 1, turnUserId: 2,
  clues: [{ userId: 1, text: "cheesy", round: 1 }], votedUserIds: [], votes: [], accusedId: null,
  imposterId: null, word: null, guess: null, result: null, reason: null, version: 4, updatedAt: 1,
  ...extra,
});

function as(user, me, g = game()) {
  useStore.setState({
    me: user,
    activeClassId: 10,
    details: { 10: { members: { 1: ada, 2: kofi, 3: li, 4: sam } } },
    imposter: {},
    imposterMe: {},
    imposterWatchers: { 9: [1, 2, 3, 4] },
    settings: { sound: false },
  });
  api.get.mockResolvedValue({ game: { ...g, me } });
}

describe("<ImposterCard>", () => {
  beforeEach(() => as(sam, { role: "spectator", word: null }));

  it("offers spectators a live view and players a join button", () => {
    const { rerender } = render(<ImposterCard initial={game()} />);
    expect(screen.getByText("Kofi is giving a clue (round 1 of 2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch live" })).toBeInTheDocument();
    rerender(<ImposterCard initial={game({ status: "lobby", turnUserId: null, players: [ada, kofi] })} />);
    expect(screen.getByRole("button", { name: "Join the game" })).toBeInTheDocument();
  });
});

describe("<ImposterCreateModal>", () => {
  it("sends the selected imposter count when creating a game", async () => {
    as(sam, { role: "spectator", word: null });
    useStore.setState((s) => ({
      details: { ...s.details, 10: { ...s.details[10], channels: { 100: { id: 100, name: "general" } } } },
    }));
    api.get.mockResolvedValue({ categories: [] });
    api.post.mockResolvedValue({ message: { id: 51, channelId: 100 } });

    render(<ImposterCreateModal channelId={100} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "2 imposters" }));
    await userEvent.click(screen.getByRole("button", { name: "Post the game" }));

    expect(api.post).toHaveBeenCalledWith("/channels/100/imposter", {
      mode: "random",
      category: undefined,
      imposterCount: 2,
    });
  });
});

describe("<ImposterModal>", () => {
  it("spectators see clues and the watcher count, never the word", async () => {
    as(sam, { role: "spectator", word: null });
    render(<ImposterModal gameId={9} onClose={() => {}} />);
    expect(await screen.findByText("You're watching")).toBeInTheDocument();
    expect(screen.getByText("cheesy")).toBeInTheDocument();
    expect(screen.getByText(/1 watching/)).toBeInTheDocument();
    expect(screen.queryByText("Show my card")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("hides the secret card until asked, and gives the player whose turn it is a clue box", async () => {
    as(kofi, { role: "player", word: "pizza", vote: null });
    render(<ImposterModal gameId={9} onClose={() => {}} />);
    await screen.findByText("Show my card");
    expect(screen.queryByText("pizza")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Show my card/ }));
    expect(screen.getByText("pizza")).toBeInTheDocument();

    api.post.mockResolvedValue({ game: { ...game({ version: 5, turnUserId: 3 }), me: { role: "player", word: "pizza" } } });
    await userEvent.type(screen.getByRole("textbox", { name: "Give clue" }), "round");
    await userEvent.click(screen.getByRole("button", { name: "Give clue" }));
    expect(api.post).toHaveBeenCalledWith("/imposter/9/clue", { text: "round" });
    expect(await screen.findByText("Li is giving a clue (round 1 of 2)")).toBeInTheDocument();
  });

  it("shows the reveal when the game is over", async () => {
    as(sam, { role: "spectator", word: null }, game({ status: "finished", turnUserId: null, imposterId: 3, word: "pizza", result: "players", reason: "caught", guess: "pasta" }));
    render(<ImposterModal gameId={9} onClose={() => {}} />);
    expect(await screen.findByText("The players win!")).toBeInTheDocument();
    expect(screen.getByText("pizza")).toBeInTheDocument();
    expect(screen.getByText(/Their guess: “pasta”/)).toBeInTheDocument();
  });
});
