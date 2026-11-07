"use client";

import { create } from "zustand";
import type { FoleyCue, FoleyManifest } from "@/lib/types";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { DEMO_MANIFEST_2, getPresetVideoUrl } from "@/mock/demoManifest";

export const BACKEND_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type DemoPresetId = "demo1" | "demo2" | "upload";

export interface UploadedVideo {
  url: string;
  name: string;
  duration: number;
}

interface FoleyState {
  videoId: string;
  videoUrl: string;
  videoDuration: number;
  fps: number;
  cues: FoleyCue[];
  selectedCueId: string | null;
  currentTime: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  demoMode: boolean;
  activePreset: DemoPresetId | "none";
  backendOnline: boolean | null;
  isAnalyzing: boolean;
  isRegenerating: boolean;
  isExporting: boolean;
  statusMessage: string;
  lastError: string | null;
  uploadedVideo: UploadedVideo | null;
  hasUserVideo: boolean;

  setVideo: (videoUrl: string, duration: number, videoId?: string) => void;
  setCues: (cues: FoleyCue[]) => void;
  loadManifest: (m: FoleyManifest, videoUrl?: string) => void;
  updateCue: (id: string, patch: Partial<FoleyCue>) => void;
  deleteCue: (id: string) => void;
  setSelectedCueId: (id: string | null) => void;
  setCurrentTime: (t: number) => void;
  setVideoDuration: (d: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: (playing?: boolean) => void;
  setLoop: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  setActivePreset: (p: DemoPresetId | "none") => void;
  setBackendOnline: (v: boolean | null) => void;
  setAnalyzing: (v: boolean) => void;
  setRegenerating: (v: boolean) => void;
  setExporting: (v: boolean) => void;
  setStatus: (msg: string) => void;
  setError: (msg: string | null) => void;
  setUploadedVideo: (v: UploadedVideo | null) => void;
  selectedCue: () => FoleyCue | null;
}

export const useFoleyStore = create<FoleyState>()((set, get) => ({
  videoId: DEMO_MANIFEST_2.videoId,
  videoUrl: getPresetVideoUrl("demo2"),
  videoDuration: DEMO_MANIFEST_2.videoDuration,
  fps: 24,
  cues: DEMO_MANIFEST_2.cues,
  selectedCueId: DEMO_MANIFEST_2.cues[0]?.id ?? null,
  currentTime: 0,
  isPlaying: false,
  loopEnabled: true,
  demoMode: true,
  activePreset: "demo2",
  backendOnline: null,
  isAnalyzing: false,
  isRegenerating: false,
  isExporting: false,
  statusMessage: "Demo mode — using cached assets, no network required.",
  lastError: null,
  uploadedVideo: null,
  hasUserVideo: false,

  setVideo: (videoUrl, duration, videoId) =>
    set((s) => ({
      videoUrl,
      videoDuration: duration,
      videoId: videoId ?? s.videoId,
      currentTime: 0,
      hasUserVideo: s.hasUserVideo || videoUrl.length > 0,
    })),
  setCues: (cues) => {
    void audioEngine.preload(cues);
    set({ cues });
  },
  loadManifest: (m, videoUrl) => {
    void audioEngine.preload(m.cues);
    set({
      videoId: m.videoId,
      videoDuration: m.videoDuration,
      cues: m.cues,
      selectedCueId: m.cues[0]?.id ?? null,
      currentTime: 0,
      ...(videoUrl ? { videoUrl } : {}),
    });
  },
  updateCue: (id, patch) =>
    set((s) => ({
      cues: s.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  deleteCue: (id) =>
    set((s) => ({
      cues: s.cues.filter((c) => c.id !== id),
      selectedCueId: s.selectedCueId === id ? null : s.selectedCueId,
    })),
  setSelectedCueId: (id) => set({ selectedCueId: id }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setVideoDuration: (d) => set({ videoDuration: d }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: (playing) => set((s) => ({ isPlaying: playing ?? !s.isPlaying })),
  setLoop: (v) => set({ loopEnabled: v }),
  setDemoMode: (v) => set({ demoMode: v }),
  setActivePreset: (p) => set({ activePreset: p }),
  setBackendOnline: (v) => set({ backendOnline: v }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setRegenerating: (v) => set({ isRegenerating: v }),
  setExporting: (v) => set({ isExporting: v }),
  setStatus: (msg) => set({ statusMessage: msg }),
  setError: (msg) => set({ lastError: msg }),
  setUploadedVideo: (v) => set({ uploadedVideo: v, hasUserVideo: v !== null }),
  selectedCue: () => {
    const s = get();
    return s.cues.find((c) => c.id === s.selectedCueId) ?? null;
  },
}));
