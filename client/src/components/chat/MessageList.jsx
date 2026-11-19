import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, BarChart3, Hash, Megaphone, Paperclip, PenLine, UserPlus } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { formatDay, isSameDay, shouldGroup } from "../../lib/format.js";
import { composer } from "../../lib/composerBus.js";
import { Avatar, Spinner } from "../ui/primitives.jsx";
import { Message, EphemeralMessage } from "./Message.jsx";

const NEAR_BOTTOM = 120;
const NEAR_TOP = 400;
const EMPTY = [];

export function MessageList({ channel, detail, list, usernames, emojis, unreadFrom, onOpenImage }) {
  const scroller = useRef(null);
  const content = useRef(null);
  const stick = useRef(true); // are we pinned to the bottom?
  const prevFirstId = useRef(null);
  const prevHeight = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const ephemeral = useStore((s) => s.ephemeral[channel.id] ?? EMPTY);
  const reads = useStore((s) => s.reads[channel.id]);
  const jump = useStore((s) => s.jump);
  const me = useStore((s) => s.me);
  const items = list?.items ?? EMPTY;

  const markReadIfVisible = useCallback(() => {
    if (stick.current && document.visibilityState === "visible" && document.hasFocus() && !list?.hasNewer) {
      useStore.getState().markRead(channel.id);
    }
  }, [channel.id, list?.hasNewer]);

  // Keep position stable when older messages are prepended; follow the bottom otherwise.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const firstId = items[0]?.id;
    if (prevFirstId.current !== null && firstId !== prevFirstId.current && typeof firstId === "number" && firstId < prevFirstId.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirstId.current = firstId ?? null;
    prevHeight.current = el.scrollHeight;
  }, [items, ephemeral]);

  // Images/fonts loading change heights: stay glued to the bottom if we were there.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !content.current) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
      prevHeight.current = el.scrollHeight;
    });
    ro.observe(content.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    markReadIfVisible();
    window.addEventListener("focus", markReadIfVisible);
    document.addEventListener("visibilitychange", markReadIfVisible);
    return () => {
      window.removeEventListener("focus", markReadIfVisible);
      document.removeEventListener("visibilitychange", markReadIfVisible);
    };
  }, [markReadIfVisible, items.length]);

  // Jump-to-message (from search, pins and reply previews).
  useEffect(() => {
    if (!jump || jump.channelId !== channel.id) return;
    const node = scroller.current?.querySelector(`[data-mid="${jump.messageId}"]`);
    if (!node) return;
    stick.current = false;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(jump.messageId);
    const t = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [jump, channel.id, items]);

  function onScroll() {
    const el = scroller.current;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = fromBottom < NEAR_BOTTOM;
    setShowJump(fromBottom > 600 || !!list?.hasNewer);
    const s = useStore.getState();
    const firstReal = items.find((m) => typeof m.id === "number");
    if (el.scrollTop < NEAR_TOP && list?.hasMore && !list.loading && firstReal) s.loadMessages(channel.id, "older", firstReal.id);
    if (fromBottom < NEAR_TOP && list?.hasNewer && !list.loading) {
      const lastReal = [...items].reverse().find((m) => typeof m.id === "number");
      if (lastReal) s.loadMessages(channel.id, "newer", lastReal.id);
    }
    if (stick.current) markReadIfVisible();
  }

  function jumpToBottom() {
    stick.current = true;
    if (list?.hasNewer) useStore.getState().loadMessages(channel.id, "latest");
    else scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  }

  // DM "seen" receipt: the other person's read marker.
  const seenId = useMemo(() => {
    if (channel.kind !== "dm" || !reads || !channel.dmUser) return null;
    return reads[channel.dmUser.id] ?? null;
  }, [channel.kind, channel.dmUser, reads]);
  const lastMine = useMemo(() => [...items].reverse().find((m) => m.author?.id === me.id && typeof m.id === "number")?.id, [items, me.id]);

  const loadingFirst = !list?.loaded;

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label={`Messages in ${channel.name}`}>
        <div ref={content} className="messages-inner">
          {list?.hasMore ? (
            <div className="list-loader">{list.loading && <Spinner />}</div>
          ) : (
            !loadingFirst && <ChannelIntro channel={channel} detail={detail} empty={items.length === 0} />
          )}
          {loadingFirst && (
            <div className="list-loader big">
              <Spinner size={26} />
            </div>
          )}
          {list?.error && <div className="list-error">Couldn't load messages: {list.error}</div>}
          {items.map((m, i) => {
            const prev = items[i - 1];
            const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
            const showUnread = unreadFrom !== null && typeof m.id === "number" && m.id > unreadFrom && (!prev || typeof prev.id !== "number" || prev.id <= unreadFrom) && m.author?.id !== me.id;
            return (
              <Fragment key={m.clientId ?? m.id}>
                {newDay && (
                  <div className="day-divider">
                    <span>{formatDay(m.createdAt)}</span>
                  </div>
                )}
                {showUnread && (
                  <div className="unread-divider">
                    <span>New</span>
                  </div>
                )}
                <Message
                  message={m}
                  grouped={!newDay && !showUnread && shouldGroup(prev, m)}
                  members={detail.members}
                  myRole={detail.myRole}
                  channelKind={channel.kind}
                  usernames={usernames}
                  emojis={emojis}
                  highlighted={highlight === m.id}
                  seen={m.id === lastMine && seenId !== null && seenId >= m.id}
                  onOpenImage={onOpenImage}
                />
              </Fragment>
            );
          })}
          {list?.hasNewer && <div className="list-loader">{list.loading && <Spinner />}</div>}
          {ephemeral.map((e) => (
            <EphemeralMessage key={e.id} entry={e} channelId={channel.id} />
          ))}
        </div>
      </div>
      {showJump && (
        <button type="button" className="jump-bottom" onClick={jumpToBottom}>
          <ArrowDown size={16} /> {channel.unread > 0 ? `${channel.unread} new` : "Latest"}
        </button>
      )}
    </div>
  );
}


/** Shown at the very top of a channel: what it is, and what you can do here. */
function ChannelIntro({ channel, detail, empty }) {
  const partner = useStore((s) => (channel.dmUser ? (s.details[channel.classId]?.members[channel.dmUser.id] ?? channel.dmUser) : null));
  const openModal = useStore((s) => s.openModal);
  const staff = isStaffRole(detail.myRole);
  const canPost = channel.kind !== "announcement" || staff;

  const actions = canPost && (
    <div className="intro-actions">
      <button type="button" className="btn btn-outline btn-sm" onClick={composer.focus}>
        <PenLine size={15} /> Write a message
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={composer.attach}>
        <Paperclip size={15} /> Share a file
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => openModal("poll", { channelId: channel.id })}>
        <BarChart3 size={15} /> Create a poll
      </button>
      {staff && channel.kind !== "dm" && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => openModal("invite", { classId: channel.classId })}>
          <UserPlus size={15} /> Invite people
        </button>
      )}
    </div>
  );

  if (channel.kind === "dm") {
    return (
      <div className="channel-intro">
        <Avatar user={partner} size={56} />
        <h2>{partner?.displayName}</h2>
        <p>
          This is your private conversation with <strong>@{partner?.username}</strong>. Only the two of you can read it.
        </p>
        {empty && actions}
      </div>
    );
  }
  const Icon = channel.kind === "announcement" ? Megaphone : Hash;
  return (
    <div className="channel-intro">
      <div className="intro-icon">
        <Icon size={26} />
      </div>
      <h2>#{channel.name}</h2>
      <p>
        {channel.topic || `This is the beginning of #${channel.name}.`}
        {channel.kind === "announcement" && " Only teachers can post here; everyone can read and react."}
      </p>
      {empty && (
        <>
          <p className="muted">No messages yet.</p>
          {actions}
        </>
      )}
    </div>
  );
}
