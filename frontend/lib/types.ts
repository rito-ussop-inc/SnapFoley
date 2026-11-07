export type FoleyCategory = "Footsteps" | "Foley/Props" | "Impact" | "Atmosphere";

export interface FoleyCue {
  id: string;
  trackIndex: number; // 0: Atmosphere, 1: Footsteps, 2: Props, 3: Impact
  category: FoleyCategory;
  timestamp: number; // Start time in seconds relative to video
  duration: number; // Duration in seconds
  prompt: string; // Acoustic prompt sent to audio synthesis
  audioUrl: string; // Direct URL to static audio file
  volume: number; // 0.0 to 1.5 (default 1.0)
  pan: number; // -1.0 (Left) to 1.0 (Right), default 0.0
  isMuted?: boolean;
}

export interface FoleyManifest {
  videoId: string;
  videoDuration: number;
  cues: FoleyCue[];
}

export const TRACKS: { index: number; label: string; category: FoleyCategory }[] = [
  { index: 0, label: "Atmosphere", category: "Atmosphere" },
  { index: 1, label: "Footsteps", category: "Footsteps" },
  { index: 2, label: "Foley/Props", category: "Foley/Props" },
  { index: 3, label: "Impacts", category: "Impact" },
];

export function categoryToTrack(category: FoleyCategory): number {
  switch (category) {
    case "Atmosphere":
      return 0;
    case "Footsteps":
      return 1;
    case "Foley/Props":
      return 2;
    case "Impact":
      return 3;
  }
}

/** HH:MM:SS:FF timecode at given fps (default 24). */
export function toTimecode(seconds: number, fps = 24): string {
  const s = Math.max(0, seconds);
  const totalFrames = Math.floor(s * fps);
  const f = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(f)}`;
}

export function formatTimecodeForSlider(seconds: number, fps = 24): string {
  return toTimecode(seconds, fps);
}
