import crypto from "node:crypto";

export const now = () => Date.now();

// No 0/O/1/I/L to keep invite codes easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function inviteCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export const randomId = (bytes = 16) => crypto.randomBytes(bytes).toString("base64url");

export function pick(list) {
  return list[crypto.randomInt(list.length)];
}

export const AVATAR_EMOJIS = [
  "🦊", "🐼", "🐸", "🐙", "🦄", "🐧", "🐨", "🦁", "🐯", "🐵", "🦉", "🐢",
  "🐳", "🦖", "🐝", "🦋", "🐞", "🦀", "🐬", "🦜", "🐹", "🐰", "🦔", "🐲",
];
export const AVATAR_COLORS = [
  "#2349b8", "#c2410c", "#2f7d4f", "#6d28d9", "#b45309", "#0e7490", "#be185d", "#4b5563",
];
export const CLASS_EMOJIS = ["📚", "🧪", "🧮", "🌍", "🎨", "💻", "🎵", "🔭", "📐", "🧠", "✏️", "🏫"];

/** Channel names: lowercase, dashes, no spaces — like "#maths-homework". */
export function slugifyChannel(name) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip accents: "Física" → "fisica"
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
