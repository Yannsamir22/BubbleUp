import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "../../lib/format.js";

// Pseudo-random but stable bar heights per file, for a friendly "waveform" look.
function bars(seed, n = 32) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 1000) / 1333;
  });
}

export function VoicePlayer({ src, duration, name }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const heights = bars(src);

  useEffect(() => {
    const a = audio.current;
    const onTime = () => setProgress(a.duration && Number.isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / (total || 1));
    const onMeta = () => Number.isFinite(a.duration) && setTotal(a.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [total]);

  function toggle() {
    const a = audio.current;
    if (a.paused) {
      // Only one voice note plays at a time.
      document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
      a.play();
    } else a.pause();
  }

  function seek(e) {
    const a = audio.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const d = Number.isFinite(a.duration) ? a.duration : total;
    if (d) a.currentTime = ratio * d;
  }

  return (
    <div className="voice">
      <button type="button" className="voice-play" onClick={toggle} aria-label={playing ? "Pause" : `Play ${name}`}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="voice-wave" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} tabIndex={-1}>
        {heights.map((h, i) => (
          <span key={i} style={{ height: `${h * 100}%` }} className={i / heights.length < progress ? "on" : ""} />
        ))}
      </div>
      <span className="voice-time">{formatDuration(playing || progress > 0 ? progress * total : total)}</span>
      <audio ref={audio} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    </div>
  );
}
