import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown, isEmojiOnly, mentions, parseBlocks } from "../src/lib/markdown.jsx";

const users = new Set(["alice", "bob"]);

describe("Markdown renderer", () => {
  it("renders bold, italic, strike and inline code", () => {
    const { container } = render(<Markdown text="**bold** *it* _also_ ~~gone~~ `x = 1`" />);
    expect(container.querySelector("strong").textContent).toBe("bold");
    expect([...container.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["it", "also"]);
    expect(container.querySelector("del").textContent).toBe("gone");
    expect(container.querySelector("code").textContent).toBe("x = 1");
  });

  it("never injects HTML", () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)"> <b>hi</b>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>hi</b>");
  });

  it("links only http(s) URLs safely", () => {
    render(<Markdown text="see https://example.com/page. and javascript:alert(1)" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/page");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("highlights known mentions and mentions of me", () => {
    const { container } = render(<Markdown text="hey @alice and @bob and @nobody" me="bob" usernames={users} />);
    const spans = container.querySelectorAll(".mention");
    expect([...spans].map((s) => s.textContent)).toEqual(["@alice", "@bob"]);
    expect(spans[1]).toHaveClass("mention-me");
  });

  it("does not treat emails as mentions or snake_case as italics", () => {
    const { container } = render(<Markdown text="mail me at sam@alice.com about snake_case_name" usernames={users} />);
    expect(container.querySelector(".mention")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
  });

  it("parses code blocks, quotes and standalone images", () => {
    const blocks = parseBlocks("intro\n```js\nconst a = 1;\n```\n> quoted\nhttps://img.test/cat.jpg?x=1");
    expect(blocks.map((b) => b.type)).toEqual(["p", "code", "quote", "image"]);
    expect(blocks[1].text).toBe("const a = 1;");
  });

  it("makes emoji-only messages jumbo", () => {
    expect(isEmojiOnly("🎉🎉")).toBe(true);
    expect(isEmojiOnly("👍🏽")).toBe(true);
    expect(isEmojiOnly("nice 🎉")).toBe(false);
    const { container } = render(<Markdown text="🔥" />);
    expect(container.firstChild).toHaveClass("md-jumbo");
  });

  it("detects mentions for notifications", () => {
    expect(mentions("Hey @Bob!", "bob")).toBe(true);
    expect(mentions("@everyone test tomorrow", "bob")).toBe(true);
    expect(mentions("hello", "bob")).toBe(false);
  });
});
