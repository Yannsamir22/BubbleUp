/**
 * A small, safe Markdown-ish renderer that produces React elements (never innerHTML).
 * Supports: ```code blocks```, > quotes, `code`, **bold**, *italic* / _italic_,
 * ~~strike~~, links, @mentions and standalone image links.
 */

const INLINE = new RegExp(
  [
    "(`[^`\\n]+`)", // 1 code
    "(\\*\\*[^*\\n]+\\*\\*)", // 2 bold
    "(~~[^~\\n]+~~)", // 3 strike
    "((?:^|(?<=[\\s(]))\\*[^*\\s][^*\\n]*\\*(?=$|[\\s.,!?:;)]))", // 4 *italic*
    "((?:^|(?<=[\\s(]))_[^_\\s][^_\\n]*_(?=$|[\\s.,!?:;)]))", // 5 _italic_
    "(https?:\\/\\/[^\\s<>\"]+[^\\s<>\".,!?:;)\\]])", // 6 url
    "((?:^|(?<=[^\\w@]))@[a-zA-Z0-9_.-]{2,20})", // 7 mention
    "(:[a-z0-9_]{2,24}:)", // 8 class emoji
  ].join("|"),
  "g",
);

/** Renders a reaction / emoji value: unicode as text, ":name:" as the class's image. */
export function EmojiGlyph({ value, emojis, size = 20 }) {
  const custom = /^:([a-z0-9_]{2,24}):$/.exec(value);
  const url = custom && emojis?.get(custom[1]);
  if (url) return <img className="custom-emoji" src={url} alt={value} title={value} style={{ width: size, height: size }} />;
  return <span>{value}</span>;
}

const CUSTOM_ONLY = /^(?:\s*(?::[a-z0-9_]{2,24}:|\p{Extended_Pictographic}(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*)\s*){1,5}$/u;

export const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?$/i;

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*\s*){1,3}$/u;
export const isEmojiOnly = (text) => !!text && text.length <= 24 && EMOJI_ONLY.test(text.trim());

function renderInline(text, ctx, keyBase) {
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    const [tok] = m;
    if (m[1]) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{renderInline(tok.slice(2, -2), ctx, key)}</strong>);
    else if (m[3]) out.push(<del key={key}>{renderInline(tok.slice(2, -2), ctx, key)}</del>);
    else if (m[4] || m[5]) out.push(<em key={key}>{renderInline(tok.slice(1, -1), ctx, key)}</em>);
    else if (m[6]) {
      out.push(
        <a key={key} href={tok} target="_blank" rel="noopener noreferrer">
          {tok.length > 60 ? `${tok.slice(0, 57)}…` : tok}
        </a>,
      );
    } else if (m[7]) {
      const name = tok.slice(1).toLowerCase();
      const known = name === "everyone" || name === "thinkmas" || ctx.usernames?.has(name);
      if (known) {
        const isMe = name === ctx.me?.toLowerCase() || name === "everyone";
        out.push(
          <span key={key} className={`mention${isMe ? " mention-me" : ""}`}>
            {tok}
          </span>,
        );
      } else out.push(tok);
    } else if (m[8]) {
      const url = ctx.emojis?.get(tok.slice(1, -1));
      out.push(url ? <img key={key} className="custom-emoji" src={url} alt={tok} title={tok} /> : tok);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Splits the body into blocks (code blocks, quotes, paragraphs, standalone images). */
export function parseBlocks(body) {
  const blocks = [];
  const parts = body.split(/```(?:[a-z0-9]*\n)?([\s\S]*?)```/g);
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) {
      blocks.push({ type: "code", text: part.replace(/\n$/, "") });
      return;
    }
    let para = [];
    let quote = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "p", text: para.join("\n") });
      if (quote.length) blocks.push({ type: "quote", text: quote.join("\n") });
      para = [];
      quote = [];
    };
    for (const line of part.split("\n")) {
      if (IMAGE_URL.test(line.trim())) {
        flush();
        blocks.push({ type: "image", url: line.trim() });
      } else if (line.startsWith("> ") || line === ">") {
        if (para.length) {
          blocks.push({ type: "p", text: para.join("\n") });
          para = [];
        }
        quote.push(line.slice(2));
      } else {
        if (quote.length) {
          blocks.push({ type: "quote", text: quote.join("\n") });
          quote = [];
        }
        para.push(line);
      }
    }
    flush();
  });
  return blocks.filter((b) => b.type !== "p" || b.text.trim() !== "" || blocks.length === 1);
}

export function Markdown({ text, me, usernames, emojis, onImageClick }) {
  if (!text) return null;
  const ctx = { me, usernames, emojis };
  if (isEmojiOnly(text)) return <div className="md md-jumbo">{text}</div>;
  // Only (class) emoji, e.g. ":party_parrot: :party_parrot:" → shown big.
  if (emojis?.size && text.length <= 140 && CUSTOM_ONLY.test(text)) {
    return <div className="md md-jumbo">{renderInline(text.trim(), ctx, "j")}</div>;
  }
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.type === "code") return <pre key={i}><code>{b.text}</code></pre>;
        if (b.type === "quote") return <blockquote key={i}>{renderInline(b.text, ctx, `q${i}`)}</blockquote>;
        if (b.type === "image") {
          return (
            <button key={i} type="button" className="md-image" onClick={() => onImageClick?.(b.url)}>
              <img src={b.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
          );
        }
        return <p key={i}>{renderInline(b.text, ctx, `p${i}`)}</p>;
      })}
    </div>
  );
}

/** Does this text mention the given username (or @everyone)? */
export function mentions(text, username) {
  if (!text || !username) return false;
  const lower = text.toLowerCase();
  return lower.includes(`@${username.toLowerCase()}`) || lower.includes("@everyone");
}
