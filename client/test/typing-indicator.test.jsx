import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useStore } from "../src/store/index.js";
import { TypingIndicator } from "../src/components/chat/TypingIndicator.jsx";

beforeEach(() => {
  useStore.setState({
    me: { id: 1 },
    typing: {},
  });
});

describe("<TypingIndicator>", () => {
  it("shows active typers in a speech bubble and hides when nobody is typing", () => {
    const members = { 2: { displayName: "Ada" }, 3: { displayName: "Kofi" } };
    const { rerender } = render(<TypingIndicator channelId={12} members={members} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    useStore.setState({ typing: { 12: { 2: Date.now() + 4000, 3: Date.now() + 4000 } } });
    rerender(<TypingIndicator channelId={12} members={members} />);
    expect(screen.getByRole("status")).toHaveTextContent("Ada and Kofi are typing");
    const bubbles = [...document.querySelectorAll(".typing-orb")];
    expect(bubbles.length).toBeGreaterThan(10);
    expect(new Set(bubbles.map((bubble) => bubble.style.getPropertyValue("--bubble-x"))).size).toBe(bubbles.length);
    expect(document.querySelectorAll(".typing-spark")).toHaveLength(bubbles.length * 4);

    useStore.setState({ typing: { 12: { 2: Date.now() - 1 } } });
    rerender(<TypingIndicator channelId={12} members={members} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
