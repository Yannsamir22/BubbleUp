import { useEffect, useMemo, useState } from "react";
import { isStaffRole, useStore } from "../../store/index.js";
import { MessageList } from "./MessageList.jsx";
import { Composer } from "./Composer.jsx";
import { TypingIndicator } from "./TypingIndicator.jsx";
import { Lightbox } from "./Lightbox.jsx";

/** One channel's conversation. Keyed by channel id, so state resets per channel. */
export function ChatView({ channel, detail }) {
  const list = useStore((s) => s.messages[channel.id]);
  const [lightbox, setLightbox] = useState(null);
  // Snapshot the read marker on open so the "New" divider doesn't jump while reading.
  const [unreadFrom] = useState(() => (channel.unread > 0 ? channel.lastReadId : null));
  const staff = isStaffRole(detail.myRole);
  const me = useStore((s) => s.me);
  const mutedUntil = detail.members[me.id]?.mutedUntil;

  useEffect(() => {
    const s = useStore.getState();
    const cur = s.messages[channel.id];
    // Re-fetch on open unless we're already live and up to date.
    if (!cur?.loaded || cur.hasNewer) s.loadMessages(channel.id, "latest");
    if (channel.kind === "dm") s.loadReads(channel.id).catch(() => {});
  }, [channel.id, channel.kind]);

  const usernames = useMemo(() => new Set(Object.values(detail.members).map((m) => m.username.toLowerCase())), [detail.members]);
  const emojis = useMemo(() => new Map((detail.emojis ?? []).map((e) => [e.name, e.url])), [detail.emojis]);

  let blocked = null;
  if (channel.kind === "announcement" && !staff) blocked = "Only teachers can post in this channel. You can still react to posts and vote in polls.";
  else if (mutedUntil && mutedUntil > Date.now() && !staff) {
    blocked = `A teacher muted you. You can write again at ${new Date(mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  }

  return (
    <div className="chat">
      <MessageList
        channel={channel}
        detail={detail}
        list={list}
        usernames={usernames}
        emojis={emojis}
        unreadFrom={unreadFrom}
        onOpenImage={setLightbox}
      />
      <div className="chat-bottom">
        <TypingIndicator channelId={channel.id} members={detail.members} />
        {blocked ? <div className="composer-blocked">{blocked}</div> : <Composer channel={channel} detail={detail} />}
      </div>
      {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
