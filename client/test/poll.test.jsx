import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Poll } from "../src/components/chat/Poll.jsx";
import { useStore } from "../src/store/index.js";

const message = (poll) => ({ id: 1, channelId: 1, poll });

describe("<Poll>", () => {
  it("hides results until you vote, then votes via the store", async () => {
    const vote = vi.fn().mockResolvedValue();
    useStore.setState({ vote });
    const poll = { question: "Best fruit?", multiple: false, closed: false, totalVoters: 3, myVotes: [], options: [{ id: 1, text: "Apple", votes: 2 }, { id: 2, text: "Mango", votes: 1 }] };
    render(<Poll message={message(poll)} canClose={false} />);
    expect(screen.getByText("Best fruit?")).toBeInTheDocument();
    expect(screen.queryByText("67%")).toBeNull();
    expect(screen.getByText(/vote to see results/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Mango/ }));
    expect(vote).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), [2]);
  });

  it("shows percentages and a winner when closed", () => {
    const poll = { question: "Q", multiple: false, closed: true, totalVoters: 4, myVotes: [], options: [{ id: 1, text: "A", votes: 3 }, { id: 2, text: "B", votes: 1 }] };
    render(<Poll message={message(poll)} canClose />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText(/Poll closed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A Most votes/ })).toBeDisabled();
    expect(screen.queryByText("Close poll")).toBeNull();
  });
});
