/**
 * Flat SVG chess pieces (drawn for BubbleUp). Unicode chess glyphs look different
 * on every device (outlined on Windows, emoji on phones), so we draw our own.
 */
const SHAPES = {
  p: (
    <>
      <circle cx="22.5" cy="13" r="5.5" />
      <path d="M17.5 21.5c1.2-1.4 3-2.3 5-2.3s3.8.9 5 2.3c-1.6 1.6-2 4-2 7 0 2.4 1.2 4.6 3 6H16.5c1.8-1.4 3-3.6 3-6 0-3-.4-5.4-2-7z" />
      <path d="M12 39.5c0-3 2.2-5 5-5h11c2.8 0 5 2 5 5v1.5H12z" />
    </>
  ),
  r: (
    <>
      <path d="M12 8h4.5v3.5h3.5V8h5v3.5h3.5V8H33v8l-3 3H15l-3-3z" />
      <path d="M15.5 19h14l1 15h-16z" />
      <path d="M11 39c0-2.8 1.7-5 4.5-5h14c2.8 0 4.5 2.2 4.5 5v2H11z" />
      <path className="detail" d="M15 19h15" fill="none" />
    </>
  ),
  n: (
    <>
      <path d="M14 34c0-6 2-9 5-12.5-2.6.6-4.7 2-6.3 3.6-1.3 1.2-3.4.7-3.7-1.1-.4-2 .5-3.7 1.6-5.4 1.8-2.8 4-5.6 5.9-8.8l1-3.3 2.6 2.7c7.2.4 12.4 5.4 13.1 13.4.3 3.7-.4 7.6-1.2 11.4z" />
      <path d="M11 39c0-2.8 1.7-5 4.5-5h14c2.8 0 4.5 2.2 4.5 5v2H11z" />
      <circle className="eye" cx="20.5" cy="15.5" r="1.4" />
      <path className="detail" d="M12.3 22.6c.9.3 1.8-.2 2.3-.9" fill="none" />
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="7.5" r="2.6" />
      <path d="M22.5 10.5c-5 3.8-7.5 8-7.5 12.2 0 3.6 2.2 6 4 7.3h7c1.8-1.3 4-3.7 4-7.3 0-4.2-2.5-8.4-7.5-12.2z" />
      <path d="M17 30h11l1.5 4h-14z" />
      <path d="M11 39c0-2.8 1.7-5 4.5-5h14c2.8 0 4.5 2.2 4.5 5v2H11z" />
      <path className="detail" d="M25.5 16l-4.5 5M22.5 21.5v4M20.5 23.5h4" fill="none" />
    </>
  ),
  q: (
    <>
      <circle cx="9" cy="12" r="2.4" />
      <circle cx="15.5" cy="9" r="2.4" />
      <circle cx="22.5" cy="8" r="2.4" />
      <circle cx="29.5" cy="9" r="2.4" />
      <circle cx="36" cy="12" r="2.4" />
      <path d="M9.5 14.5l4.5 13 1.5-15.5 4 14.5 3-16 3 16 4-14.5 1.5 15.5 4.5-13-3.5 16.5h-19z" />
      <path d="M13 31h19l1 3H12z" />
      <path d="M11 39c0-2.8 1.7-5 4.5-5h14c2.8 0 4.5 2.2 4.5 5v2H11z" />
    </>
  ),
  k: (
    <>
      <path d="M21 4h3v3h3v3h-3v4h-3v-4h-3V7h3z" />
      <path d="M22.5 14c3 0 5 2.2 5 5 0 1.3-.4 2.4-1 3.4 2.6-1.8 5.4-2.6 8-2 2.5.6 3.5 3 2.8 5.6-.9 3.3-3.8 6.2-7.3 8H15c-3.5-1.8-6.4-4.7-7.3-8-.7-2.6.3-5 2.8-5.6 2.6-.6 5.4.2 8 2-.6-1-1-2.1-1-3.4 0-2.8 2-5 5-5z" />
      <path d="M11 39c0-2.8 1.7-5 4.5-5h14c2.8 0 4.5 2.2 4.5 5v2H11z" />
      <path className="detail" d="M22.5 22v12" fill="none" />
    </>
  ),
};

export const PIECE_NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

export function Piece({ type, color }) {
  return (
    <svg className={`piece ${color === "w" ? "white" : "black"}`} viewBox="0 0 45 45" aria-hidden="true">
      {SHAPES[type]}
    </svg>
  );
}
