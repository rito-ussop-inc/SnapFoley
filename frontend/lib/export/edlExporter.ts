import type { FoleyCue } from "@/lib/types";
import { toTimecode } from "@/lib/types";

export const EDL_FPS = 24;

function fileNameForCue(cue: FoleyCue): string {
  const ts = cue.timestamp.toFixed(2).replace(".", "_");
  const safe = cue.id.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${cue.category.replace(/[^a-zA-Z0-9]/g, "")}_${ts}_${safe}.wav`;
}

/**
 * Render a CMX 3600 EDL string.
 * Each cue is one event. Source = record (same timeline).
 */
export function buildEdl(cues: FoleyCue[], fps = EDL_FPS, title = "SnapFoley Session"): string {
  const sorted = [...cues].sort((a, b) => a.timestamp - b.timestamp);
  const lines: string[] = [];
  lines.push(`TITLE: ${title}`);
  lines.push(`FCM: NON-DROP FRAME`);
  lines.push("");
  sorted.forEach((cue, i) => {
    const eventNo = String(i + 1).padStart(3, "0");
    const start = toTimecode(cue.timestamp, fps);
    const end = toTimecode(cue.timestamp + cue.duration, fps);
    lines.push(`${eventNo}  AX       V     C        ${start} ${end} ${start} ${end}`);
    const f = fileNameForCue(cue);
    lines.push(`* FROM CLIP NAME: ${f}`);
    const comment = `* CUE: ${cue.category} | prompt: ${cue.prompt} | volume: ${
      Math.round(cue.volume * 100)
    }% | pan: ${cue.pan.toFixed(2)}${cue.isMuted ? " | MUTED" : ""}`;
    lines.push(comment);
    lines.push("");
  });
  return lines.join("\n");
}

export function downloadEdl(cues: FoleyCue[], filename = "snapfoley_session.edl") {
  const text = buildEdl(cues);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { fileNameForCue };
