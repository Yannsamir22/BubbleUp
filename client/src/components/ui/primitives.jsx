import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, X } from "lucide-react";

export function Logo({ size = 32, withText = false }) {
  return (
    <span className="logo">
      <svg className="logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 6h24a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6H18l-8 6v-6H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" fill="var(--primary)" />
        <circle cx="30" cy="10" r="7" fill="#ffd84d" stroke="var(--surface)" strokeWidth="2.5" />
        <path d="M11 17h14M11 22.5h9" stroke="var(--primary-text)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {withText && <span className="logo-text">BubbleUp</span>}
    </span>
  );
}

export function initials(name = "") {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ user, size = 36, online, ring }) {
  const style = { "--size": `${size}px`,"--avatar-color": user?.avatarColor, ...(ring ? { "--presence-ring": ring } : {}) };
  let cls = "avatar";
  let content;
  if (!user) content = "?";
  else if (user.bot) {
    cls += " avatar-bot";
    content = <Bot size={Math.round(size * 0.55)} />;
  } else if (user.avatarEmoji) content = user.avatarEmoji;
  else {
    cls += " avatar-initials";
    content = initials(user.displayName || user.username);
  }
  return (
    <span className={cls} style={style} title={user?.displayName} aria-hidden="true">
      {content}
      {online !== undefined && <span className={`presence${online ? " online" : ""}`} />}
    </span>
  );
}

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Button({ variant = "default", size, block, loading, children, className = "", ...rest }) {
  const cls = ["btn", variant !== "default" && `btn-${variant}`, size && `btn-${size}`, block && "btn-block", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={16} /> : children}
    </button>
  );
}

export function IconButton({ label, active, size, children, className = "", ...rest }) {
  return (
    <button
      type="button"
      className={`icon-btn${size === "sm" ? " icon-btn-sm" : ""}${active ? " active" : ""} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Closes on Escape and outside click. */
function useDismiss(ref, onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [ref, onClose]);
}

export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    const first = ref.current?.querySelector("input, textarea, select, button:not(.modal-close)");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close" className="modal-close" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A floating panel anchored to a DOMRect. Flips to stay on screen.
 * Usage: const [anchor, setAnchor] = useState(null); onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
 */
export function Popover({ anchor, onClose, children, align = "start", className = "menu" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useDismiss(ref, onClose);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "end" ? anchor.right - w : anchor.left;
    let top = anchor.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, anchor.top - h - 6);
    left = Math.min(Math.max(8, left), vw - w - 8);
    setPos({ top, left });
  }, [anchor, align]);
  if (!anchor) return null;
  return createPortal(
    <div className={className} style={pos} ref={ref} role="menu">
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon: Icon, children, danger, onClick }) {
  return (
    <button type="button" role="menuitem" className={`menu-item${danger ? " danger" : ""}`} onClick={onClick}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-emoji">
          <Icon size={28} />
        </div>
      )}
      {title && <h3>{title}</h3>}
      {children && <div>{children}</div>}
    </div>
  );
}
