import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, X } from "lucide-react";

export function Lightbox({ image, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const isLocal = image.url.startsWith("/api/");
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image viewer">
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-name">{image.name}</span>
        <a className="icon-btn" href={image.url} target="_blank" rel="noopener noreferrer" aria-label="Open original">
          <ExternalLink size={18} />
        </a>
        {isLocal && (
          <a className="icon-btn" href={`${image.url}?download=1`} download aria-label="Download">
            <Download size={18} />
          </a>
        )}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <img src={image.url} alt={image.name} onClick={(e) => e.stopPropagation()} referrerPolicy="no-referrer" />
    </div>,
    document.body,
  );
}
