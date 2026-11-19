import { Download, FileText, FileArchive, File as FileIcon, FileSpreadsheet, Presentation } from "lucide-react";
import { fileKind, formatBytes } from "../../lib/format.js";
import { VoicePlayer } from "./VoicePlayer.jsx";

function iconFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["zip", "rar", "7z", "gz"].includes(ext)) return FileArchive;
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return FileSpreadsheet;
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return Presentation;
  if (["pdf", "doc", "docx", "txt", "odt", "md", "rtf"].includes(ext)) return FileText;
  return FileIcon;
}

export function Attachments({ attachments, onOpenImage }) {
  const images = attachments.filter((a) => fileKind(a.mime) === "image");
  const others = attachments.filter((a) => fileKind(a.mime) !== "image");
  return (
    <div className="attachments">
      {images.length > 0 && (
        <div className={`image-grid n${Math.min(images.length, 4)}`}>
          {images.map((a) => (
            <button key={a.id} type="button" className="image-tile" onClick={() => onOpenImage(a)} aria-label={`Open image ${a.name}`}>
              <img
                src={a.url}
                alt={a.name}
                loading="lazy"
                decoding="async"
                width={a.width ?? undefined}
                height={a.height ?? undefined}
                style={a.width && a.height && images.length === 1 ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
              />
            </button>
          ))}
        </div>
      )}
      {others.map((a) => {
        const kind = fileKind(a.mime);
        if (kind === "audio") return <VoicePlayer key={a.id} src={a.url} duration={a.duration} name={a.name} />;
        if (kind === "video") {
          return (
            <video key={a.id} className="video-att" src={a.url} controls preload="metadata">
              <track kind="captions" />
            </video>
          );
        }
        const Icon = iconFor(a.name);
        return (
          <div key={a.id} className="file-card">
            <span className="file-icon">
              <Icon size={22} />
            </span>
            <span className="file-info">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="file-name" title={a.name}>
                {a.name}
              </a>
              <span className="file-size">{formatBytes(a.size)}</span>
            </span>
            <a href={`${a.url}?download=1`} className="icon-btn" aria-label={`Download ${a.name}`} title="Download" download>
              <Download size={18} />
            </a>
          </div>
        );
      })}
    </div>
  );
}
