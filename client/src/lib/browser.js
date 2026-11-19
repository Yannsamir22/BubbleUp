// Browser helpers: safe storage, sounds, notifications, media.

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`bubbleup:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`bubbleup:${key}`, JSON.stringify(value));
    } catch {
      /* private mode etc. */
    }
  },
};

let audioCtx;
/** A synthesized "bubble pop" — no audio files needed. */
export function playPop() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch {
    /* audio unavailable */
  }
}

export const notificationsSupported = () => "Notification" in window && window.isSecureContext;

export function showNotification(title, body, onClick) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body: body.slice(0, 140), icon: "/favicon.svg", tag: title });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some mobile browsers throw */
  }
}

export async function imageSize(file) {
  if (!file.type.startsWith("image/") || !("createImageBitmap" in window)) return {};
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return size;
  } catch {
    return {};
  }
}

export const canRecordAudio = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.isSecureContext);

export function pickAudioMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? "";
}
