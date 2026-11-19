import { useSyncExternalStore } from "react";

/** A tiny History-API router — the app only has a handful of URLs. */
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
window.addEventListener("popstate", emit);

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  emit();
}

export function usePath() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => window.location.pathname,
  );
}

/** "/c/12/34" → { classId: 12, channelId: 34 } */
export function parseRoute(path) {
  const m = path.match(/^\/c\/(\d+)(?:\/(\d+))?\/?$/);
  if (m) return { name: "chat", classId: Number(m[1]), channelId: m[2] ? Number(m[2]) : null };
  if (path.startsWith("/welcome")) return { name: "welcome" };
  return { name: "home" };
}

export const chatPath = (classId, channelId) => (channelId ? `/c/${classId}/${channelId}` : `/c/${classId}`);
