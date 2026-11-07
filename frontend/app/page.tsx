"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/daw/Header";
import { VideoPlayer } from "@/components/daw/VideoPlayer";
import { Timeline } from "@/components/daw/Timeline";
import { CueInspector } from "@/components/daw/CueInspector";
import { useFoleyStore, BACKEND_BASE } from "@/store/useFoleyStore";
import { audioEngine } from "@/lib/audio/AudioEngine";
import {
  DEMO_MANIFEST_1,
  DEMO_MANIFEST_2,
  getPresetVideoUrl,
  manifestForPreset,
} from "@/mock/demoManifest";
import { downloadEdl } from "@/lib/export/edlExporter";
import { downloadStemsZip } from "@/lib/export/zipExporter";
import type { FoleyCue, FoleyManifest } from "@/lib/types";
import { Upload, AlertTriangle, X } from "lucide-react";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const store = useFoleyStore;
  const {
    videoUrl,
    cues,
    setVideo,
    setCues,
    loadManifest,
    setPlaying,
    isPlaying,
    setStatus,
    setError,
    setBackendOnline,
    setAnalyzing,
    setExporting,
    demoMode,
    setDemoMode,
    activePreset,
    setActivePreset,
    updateCue,
    deleteCue,
    selectedCueId,
  } = store();

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || store.getState().videoDuration));
  }, [store]);

  const checkBackend = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setBackendOnline(true);
        return true;
      }
      setBackendOnline(false);
      return false;
    } catch {
      setBackendOnline(false);
      return false;
    }
  }, [setBackendOnline]);

  const applyPreset = useCallback(
    (id: "demo1" | "demo2") => {
      const manifest = manifestForPreset(id);
      const url = getPresetVideoUrl(id);
      setActivePreset(id);
      setDemoMode(true);
      loadManifest(manifest, url);
      setVideo(url, manifest.videoDuration, manifest.videoId);
      setStatus(`Demo mode: ${id === "demo1" ? "Sci-Fi Walk" : "Combat Impact"} loaded (cached audio, no backend needed).`);
      setError(null);
      setPlaying(false);
      audioEngine.stopAll();
      void checkBackend();
    },
    [loadManifest, setActivePreset, setDemoMode, setStatus, setError, setPlaying, setVideo, checkBackend],
  );

  // Initial demo load
  useEffect(() => {
    applyPreset("demo2");
    void checkBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploadFile = useCallback(
    (file: File) => {
      setUploadError(null);
      const lower = file.name.toLowerCase();
      const isMp4 = lower.endsWith(".mp4");
      const isMov = lower.endsWith(".mov");
      if (!isMp4 && !isMov) {
        setUploadError("Only .mp4 and .mov files are supported.");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setUploadError("File exceeds 50 MB demo limit.");
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        const d = probe.duration;
        const capped = Number.isFinite(d) ? Math.min(d, 60) : 15;
        setVideo(url, capped, `upload-${Date.now().toString(36)}`);
        store.getState().setUploadedVideo({ url, name: file.name, duration: capped });
        setActivePreset("upload");
        setDemoMode(false);
        setStatus(`Uploaded ${file.name} (${capped.toFixed(1)}s). Click "Analyze & Spot Foley" to detect cues.`);
        setError(null);
        setCues([]);
        URL.revokeObjectURL(probe.src);
      };
      probe.onerror = () => {
        setUploadError("Could not read video metadata. Try a different .mp4/.mov.");
        URL.revokeObjectURL(url);
      };
      probe.src = url;
    },
    [setVideo, setActivePreset, setDemoMode, setStatus, setError, setCues],
  );

  // Drag & drop
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleUploadFile(f);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleUploadFile]);

  const handleAnalyze = useCallback(async () => {
    const state = store.getState();
    setAnalyzing(true);
    setError(null);
    setStatus("Analyzing video for physical contact cues…");

    // Blob-URL uploads can't be re-fetched by the backend; in that case go straight to fallback.
    const isBlob = state.videoUrl.startsWith("blob:");
    if (demoMode || isBlob) {
      // Offline path: simulate vision analysis with the active preset's manifest,
      // re-timed to the uploaded duration if needed.
      const base = activePreset === "demo1" ? DEMO_MANIFEST_1 : DEMO_MANIFEST_2;
      const scaled = retimeCues(base.cues, base.videoDuration, state.videoDuration);
      loadManifest({ videoId: state.videoId, videoDuration: state.videoDuration, cues: scaled });
      setStatus(demoMode ? "Demo Mode: loaded cached cue manifest (vision bypassed)." : "Offline analysis: seeded cues for uploaded video. Start the backend for Gemini vision.");
      setAnalyzing(false);
      return;
    }

    let remoteCues: FoleyCue[] | null = null;
    let remoteDuration: number | null = null;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15000);
      let res: Response;
      // Decide: if we have an uploaded file on disk we can't send blob; send videoId hint.
      // Backend accepts either a multipart file (when run from CLI) or a videoId for samples.
      res = await fetch(`${BACKEND_BASE}/api/analyze-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: state.videoId, videoUrl: state.videoUrl }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as {
          cues?: FoleyCue[];
          videoDuration?: number;
        };
        if (Array.isArray(data.cues) && data.cues.length > 0) {
          remoteCues = data.cues;
          remoteDuration = data.videoDuration ?? null;
          setBackendOnline(true);
        }
      }
    } catch {
      setBackendOnline(false);
    }

    if (remoteCues) {
      loadManifest({
        videoId: state.videoId,
        videoDuration: remoteDuration ?? state.videoDuration,
        cues: remoteCues,
      });
      setStatus(`Vision analysis complete: ${remoteCues.length} cues spottped. Synthesizing audio…`);

      // Synthesize each cue via backend (fallback keeps mock audioUrl).
      const synthesized = await Promise.all(
        remoteCues.map(async (cue) => {
          try {
            const r = await fetch(`${BACKEND_BASE}/api/synthesize-cue`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cueId: cue.id,
                prompt: cue.prompt,
                duration: cue.duration,
                category: cue.category,
              }),
              signal: AbortSignal.timeout(20000),
            });
            if (r.ok) {
              const j = (await r.json()) as { audioUrl?: string };
              if (j.audioUrl) {
                const absolute = j.audioUrl.startsWith("http")
                  ? j.audioUrl
                  : `${BACKEND_BASE}${j.audioUrl.startsWith("/") ? j.audioUrl : `/${j.audioUrl}`}`;
                audioEngine.clearCacheFor(cue.id);
                return { ...cue, audioUrl: absolute };
              }
            }
          } catch {
            /* fallback */
          }
          return cue;
        }),
      );
      setCues(synthesized);
      setStatus(`Analysis + synthesis complete: ${synthesized.length} cues ready.`);
    } else {
      // Fallback to mock data on timeout / backend mismatch.
      const base = activePreset === "demo1" ? DEMO_MANIFEST_1 : DEMO_MANIFEST_2;
      const scaled = retimeCues(base.cues, base.videoDuration, state.videoDuration);
      loadManifest({ videoId: state.videoId, videoDuration: state.videoDuration, cues: scaled });
      setStatus("Backend timed out — fell back to cached demo cues. Start uvicorn for live AI.");
      setBackendOnline(false);
    }
    setAnalyzing(false);
  }, [demoMode, activePreset, loadManifest, setAnalyzing, setError, setStatus, setBackendOnline, setCues]);

  const handleRegenerate = useCallback(
    async (cueId: string, prompt: string, duration: number) => {
      const state = store.getState();
      const cue = state.cues.find((c) => c.id === cueId);
      if (!cue) return;
      setStatus(`Regenerating take for ${cueId}…`);
      let newUrl: string | null = null;
      if (!demoMode) {
        try {
          const r = await fetch(`${BACKEND_BASE}/api/synthesize-cue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cueId, prompt, duration, category: cue.category }),
            signal: AbortSignal.timeout(20000),
          });
          if (r.ok) {
            const j = (await r.json()) as { audioUrl?: string };
            if (j.audioUrl) {
              newUrl = j.audioUrl.startsWith("http")
                ? j.audioUrl
                : `${BACKEND_BASE}${j.audioUrl.startsWith("/") ? j.audioUrl : `/${j.audioUrl}`}`;
            }
          }
        } catch {
          newUrl = null;
        }
      }
      if (newUrl) {
        audioEngine.clearCacheFor(cueId);
        updateCue(cueId, { audioUrl: newUrl });
        setStatus(`New take ready for ${cueId}. Press Preview to audition.`);
      } else {
        // Demo-mode "regeneration": cache-bust + audition existing mock take.
        const fresh = { ...cue, prompt, audioUrl: `${cue.audioUrl}?t=${Date.now()}` };
        audioEngine.clearCacheFor(cueId);
        updateCue(cueId, { prompt, audioUrl: fresh.audioUrl });
        setStatus("Demo Mode: reused cached take with updated prompt (backend offline).");
      }
      const refreshed = store.getState().cues.find((c) => c.id === cueId);
      if (refreshed) await audioEngine.preview(refreshed);
    },
    [demoMode, setStatus, updateCue],
  );

  const handleExportEdl = useCallback(() => {
    if (cues.length === 0) return;
    downloadEdl(cues);
    setStatus(`Exported ${cues.length} cues as CMX 3600 EDL (24 fps).`);
  }, [cues, setStatus]);

  const handleExportZip = useCallback(async () => {
    if (cues.length === 0) return;
    setExporting(true);
    try {
      await downloadStemsZip(cues);
      setStatus(`Exported ${cues.length} stems + EDL as snapfoley_stems.zip.`);
    } catch {
      setError("ZIP export failed — check that all cue audio URLs are reachable.");
    } finally {
      setExporting(false);
    }
  }, [cues, setExporting, setStatus, setError]);

  // Keyboard shortcuts: Space, J/K/L, Delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
          void v.play().catch(() => undefined);
          setPlaying(true);
          void audioEngine.syncPlay(store.getState().cues, v.currentTime || 0);
        } else {
          v.pause();
          setPlaying(false);
          audioEngine.stopAll();
        }
      } else if (e.key === "j" || e.key === "J") {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, v.currentTime - 2);
      } else if (e.key === "k" || e.key === "K") {
        const v = videoRef.current;
        if (v) {
          v.pause();
          setPlaying(false);
          audioEngine.stopAll();
        }
      } else if (e.key === "l" || e.key === "L") {
        const v = videoRef.current;
        if (v) {
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 2);
          if (v.paused) {
            void v.play().catch(() => undefined);
            setPlaying(true);
          }
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedCueId) deleteCue(selectedCueId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCueId, deleteCue, setPlaying]);

  return (
    <div className="flex min-h-full flex-col bg-base text-zinc-100">
      <Header
        onAnalyze={handleAnalyze}
        onExportEdl={handleExportEdl}
        onExportZip={handleExportZip}
        onSelectPreset={applyPreset}
        onUploadFile={handleUploadFile}
        onCheckBackend={checkBackend}
      />

      {uploadError && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto"
            aria-label="Dismiss upload error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[420px_1fr_340px] lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <VideoPlayer videoRef={videoRef} onTimeUpdate={() => {}} />
          <div className="rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-zinc-400">
            <p className="font-semibold text-zinc-200">How to use</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Pick a demo preset or drag-and-drop a .mp4/.mov (≤50 MB).</li>
              <li>Click <span className="text-zinc-200">Analyze &amp; Spot Foley</span> to detect cues.</li>
              <li>Drag cue blocks on the timeline; edit prompt / volume / pan on the right.</li>
              <li>Preview with Space. Export EDL or Stems ZIP for your NLE.</li>
            </ol>
            <p className="mt-2 text-zinc-500">
              Shortcuts: <span className="text-zinc-300">Space</span> play/pause •{" "}
              <span className="text-zinc-300">J/K/L</span> shuttle •{" "}
              <span className="text-zinc-300">Delete</span> remove cue.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-1 xl:col-span-1">
          <Timeline onSeek={seekTo} />
          <div className="hidden rounded-xl border border-line bg-panel p-3 text-[11px] text-zinc-400 xl:block">
            <p className="font-semibold text-zinc-200">Acceptance checks</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Scrubbing moves the playhead with the video clock.</li>
              <li>Dragging a cue updates its scheduled start without reload.</li>
              <li>Pause / seek use 5 ms ramps — no clicks.</li>
              <li>EDL validates at 24 fps SMPTE.</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <CueInspector videoRef={videoRef} onRegenerate={handleRegenerate} />
        </div>
      </main>

      <footer className="border-t border-line px-4 py-2 text-center text-[11px] text-zinc-500">
        SnapFoley — browser DAW (Web Audio) + FastAPI + Gemini vision + ElevenLabs SFX. Demo Mode works without any API keys.
      </footer>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-panel px-10 py-8 text-center">
            <Upload size={28} className="text-accent" />
            <p className="text-sm font-semibold text-white">Drop your .mp4 / .mov</p>
            <p className="text-xs text-zinc-400">Max 50 MB • up to 60 s</p>
          </div>
        </div>
      )}
    </div>
  );
}

function retimeCues(cues: FoleyCue[], fromDur: number, toDur: number): FoleyCue[] {
  if (fromDur === toDur || fromDur <= 0) return cues.map((c) => ({ ...c, id: `${c.id}` }));
  const scale = toDur / fromDur;
  return cues
    .map((c) => ({
      ...c,
      timestamp: Math.min(c.timestamp * scale, Math.max(0, toDur - c.duration)),
    }))
    .filter((c) => c.timestamp < toDur);
}
