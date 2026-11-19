import { useState } from "react";
import { BarChart3, Check, Lock } from "lucide-react";
import { useStore } from "../../store/index.js";
import { Button } from "../ui/primitives.jsx";

export function Poll({ message, canClose }) {
  const { poll } = message;
  const s = useStore.getState;
  const myVotes = poll.myVotes ?? [];
  const [busy, setBusy] = useState(false);
  const voted = myVotes.length > 0;
  const showResults = voted || poll.closed;
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const pending = typeof message.id === "string";

  async function choose(optionId) {
    if (poll.closed || busy || pending) return;
    let next;
    if (poll.multiple) next = myVotes.includes(optionId) ? myVotes.filter((x) => x !== optionId) : [...myVotes, optionId];
    else next = myVotes.includes(optionId) ? [] : [optionId];
    setBusy(true);
    await s().attempt(() => s().vote(message, next)).catch(() => {});
    setBusy(false);
  }

  return (
    <div className={`poll${poll.closed ? " closed" : ""}`}>
      <div className="poll-head">
        <BarChart3 size={18} />
        <strong>{poll.question}</strong>
      </div>
      <div className="poll-sub">
        {poll.closed ? (
          <>
            <Lock size={12} /> Poll closed
          </>
        ) : poll.multiple ? (
          "Pick as many as you like"
        ) : (
          "Pick one"
        )}
        {poll.anonymous && " · anonymous"}
      </div>
      <div className="poll-options">
        {poll.options.map((o) => {
          const mine = myVotes.includes(o.id);
          const pct = poll.totalVoters ? Math.round((o.votes / poll.totalVoters) * 100) : 0;
          const winner = poll.closed && o.votes === max && o.votes > 0;
          return (
            <button
              key={o.id}
              type="button"
              className={`poll-option${mine ? " mine" : ""}${winner ? " winner" : ""}`}
              onClick={() => choose(o.id)}
              disabled={poll.closed || busy || pending}
              aria-pressed={mine}
            >
              {showResults && <span className="poll-bar" style={{ width: `${pct}%` }} />}
              <span className="poll-check">{mine && <Check size={14} />}</span>
              <span className="poll-text">
                {o.text} {winner && <span className="poll-winner">Most votes</span>}
              </span>
              {showResults && <span className="poll-pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-foot">
        <span>
          {poll.totalVoters} vote{poll.totalVoters === 1 ? "" : "s"}
          {!showResults && " · vote to see results"}
        </span>
        {canClose && !poll.closed && !pending && (
          <Button size="sm" variant="ghost" onClick={() => s().attempt(() => s().closePoll(message)).catch(() => {})}>
            Close poll
          </Button>
        )}
      </div>
    </div>
  );
}
