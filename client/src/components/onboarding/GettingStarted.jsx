import { useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { isStaffRole, useStore } from "../../store/index.js";
import { storage } from "../../lib/browser.js";
import { chatPath, navigate } from "../../lib/router.js";
import { composer } from "../../lib/composerBus.js";

/**
 * A short, role-specific checklist shown at the top of the sidebar.
 * Steps tick themselves when the person actually does the thing.
 */
function stepsFor(detail, activeChannelId) {
  const s = useStore.getState;
  const classId = detail.class.id;
  const channelByName = (name) => Object.values(detail.channels).find((c) => c.name === name && c.kind !== "dm");
  const goTo = (name, then) => () => {
    const ch = channelByName(name);
    if (ch) navigate(chatPath(classId, ch.id));
    setTimeout(then ?? composer.focus, 50);
  };

  const help = {
    key: "help",
    label: "Read the quick guide",
    hint: "How classes, channels and private messages fit together.",
    run: () => s().openModal("help"),
  };
  const profile = {
    key: "profile",
    label: "Set your profile picture",
    hint: "So people recognise you.",
    run: () => s().openModal("profile"),
  };

  if (isStaffRole(detail.myRole)) {
    return [
      help,
      {
        key: "invite",
        label: "Invite your students",
        hint: "Share the class code. Students type it on the “Join a class” screen.",
        run: () => s().openModal("invite", { classId }),
      },
      {
        key: "announce",
        label: "Post an announcement",
        hint: "Only teachers can write in #announcements, so important news doesn't get lost.",
        run: goTo("announcements"),
      },
      {
        key: "channel",
        label: "Add a subject channel",
        hint: "For example #lab-reports or #revision.",
        run: () => s().openModal("channel", { classId }),
      },
      {
        key: "poll",
        label: "Run a poll",
        hint: "Quick way to decide things together.",
        run: () => s().openModal("poll", { channelId: activeChannelId ?? channelByName("general")?.id }),
      },
      profile,
    ];
  }
  return [
    help,
    {
      key: "message",
      label: "Say hello in #general",
      hint: "Type in the box at the bottom and press Enter.",
      run: goTo("general"),
    },
    profile,
    {
      key: "react",
      label: "React to a message",
      hint: "Point at a message (or tap it on a phone) and pick an emoji.",
      run: goTo("general", () => {}),
    },
    {
      key: "file",
      label: "Share a file or photo",
      hint: "Use the paperclip, or drag a file onto the chat.",
      run: () => composer.attach(),
    },
    {
      key: "dm",
      label: "Send a private message",
      hint: "Only you and the other person can read it.",
      run: () => s().openModal("newDm", { classId }),
    },
  ];
}

export function GettingStarted({ detail, activeChannelId }) {
  const progress = useStore((s) => s.progress);
  const meId = useStore((s) => s.me.id);
  const [hidden, setHidden] = useState(() => storage.get(`guideHidden:${meId}`, false));
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const steps = stepsFor(detail, activeChannelId);
  const done = steps.filter((st) => progress[st.key]).length;
  if (hidden) return null;

  const hide = () => {
    storage.set(`guideHidden:${meId}`, true);
    setHidden(true);
  };

  if (done === steps.length) {
    return (
      <div className="guide guide-done">
        <Check size={16} />
        <span>You're all set up.</span>
        <button type="button" className="link-btn" onClick={hide}>
          Hide
        </button>
      </div>
    );
  }

  return (
    <section className="guide" aria-label="Getting started">
      <div className="guide-head">
        <button type="button" className="guide-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <strong>Getting started</strong>
          <span className="guide-count">
            {done}/{steps.length}
          </span>
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={hide} aria-label="Hide getting started" title="Hide">
          <X size={14} />
        </button>
      </div>
      <div className="guide-bar">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      {open && (
        <ol className="guide-steps">
          {steps.map((st) => {
            const isDone = !!progress[st.key];
            const isOpen = expanded === st.key;
            return (
              <li key={st.key} className={isDone ? "done" : ""}>
                <button
                  type="button"
                  className="guide-step"
                  onClick={() => {
                    setExpanded(isOpen ? null : st.key);
                    if (!isDone) st.run();
                  }}
                >
                  <span className="guide-check">{isDone && <Check size={12} strokeWidth={3} />}</span>
                  <span>{st.label}</span>
                </button>
                {isOpen && !isDone && <p className="guide-hint">{st.hint}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
