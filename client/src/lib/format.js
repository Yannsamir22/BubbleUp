const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

export const formatTime = (ts) => timeFmt.format(ts);
export const formatFull = (ts) => fullFmt.format(ts);

export function isSameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function formatDay(ts) {
  const now = Date.now();
  if (isSameDay(ts, now)) return "Today";
  if (isSameDay(ts, now - 86_400_000)) return "Yesterday";
  return dayFmt.format(ts);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Group consecutive messages by the same author within 5 minutes. */
export function shouldGroup(prev, msg) {
  if (!prev || prev.kind !== msg.kind || msg.kind === "system") return false;
  if (!prev.author || !msg.author || prev.author.id !== msg.author.id) return false;
  if (msg.replyTo || msg.poll) return false;
  if (!isSameDay(prev.createdAt, msg.createdAt)) return false;
  return msg.createdAt - prev.createdAt < 5 * 60_000;
}

export function typingText(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  return "Several people are typing";
}

export function fileKind(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "file";
}
