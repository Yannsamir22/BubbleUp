import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

export const LANGUAGE_LABELS = { en: "English", fr: "Français" };

/** Same rule as the server: accents and case don't matter, so "café" asks for an E. */
export function nextLetter(game) {
  const previous = game.chain.at(-1)?.word;
  if (!previous) return null;
  return previous.replace(/œ/gi, "oe").normalize("NFD").replace(/\p{M}/gu, "").at(-1).toUpperCase();
}

/** Whole seconds left on the current turn, or null when no turn is running. */
export function useTurnTimer(game) {
  const deadline = game?.status === "playing" ? game.turnDeadline : null;
  const offset = game?.clockOffset ?? 0;
  const left = () => (deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000)) : null);
  const [seconds, setSeconds] = useState(left);

  useEffect(() => {
    setSeconds(left());
    if (!deadline) return undefined;
    const timer = setInterval(() => setSeconds(left()), 250);
    return () => clearInterval(timer);
  }, [deadline, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  return seconds;
}

export function Lives({ count, max }) {
  return (
    <span className="word-chain-lives" aria-label={`${count} of ${max} lives left`} title={`${count}/${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} size={12} className={i < count ? "full" : "empty"} aria-hidden="true" />
      ))}
    </span>
  );
}

/** One line describing what just happened (a life lost, a player out). */
export function eventText(game, meId) {
  const event = game.lastEvent;
  if (!event || event.type === "word") return null;
  const player = game.players.find((p) => p.id === event.userId);
  const name = event.userId === meId ? "You" : player?.displayName ?? "A player";
  if (event.type === "forfeit") return `${name} gave up.`;
  const why = (event.type === "timeout" ? `${name} ran out of time` : event.detail ?? `${name} made a mistake`).replace(/\.$/, "");
  if (event.eliminated) return `${why} — ${event.userId === meId ? "you're" : `${name} is`} out!`;
  return `${why} — ${event.userId === meId ? "you lose" : `${name} loses`} a life.`;
}
