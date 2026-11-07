"use client";

import { useCallback, useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward, Film } from "lucide-react";
import { useFoleyStore } from "@/store/useFoleyStore";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { toTimecode } from "@/lib/types";

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate: (t: number) => void;
}

export function VideoPlayer({ videoRef, onTimeUpdate }: VideoPlayerProps) {
  const {
    videoUrl,
    videoDuration,
    currentTime,
    isPlaying,
    loopEnabled,
    setPlaying,
    setCurrentTime,
    setVideoDuration,
    setStatus,
  } = useFoleyStore();
  const rangeRef = useRef<HTMLInputElement>(null);
  const cuesRef = useRef(useFoleyStore.getState().cues);
  useEffect(() => {
    cuesRef.current = useFoleyStore.getState().cues;
  });

  const syncFromVideo = useCallback(
    (t: number) => {
      setCurrentTime(t);
      onTimeUpdate(t);
      if (rangeRef.current) rangeRef.current.value = String(t);
    },
    [onTimeUpdate, setCurrentTime],
  );

  const toggle = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    if (v.paused) {
      await v.play().catch(() => undefined);
      void audioEngine.syncPlay(cuesRef.current, v.currentTime || 0);
      setPlaying(true);
    } else {
      v.pause();
      audioEngine.stopAll();
      setPlaying(false);
    }
  }, [videoRef, videoUrl, setPlaying]);

  // Keep video element in sync with store play intent (e.g. Space shortcut).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying && v.paused && videoUrl) {
      void v.play().catch(() => undefined);
      void audioEngine.syncPlay(cuesRef.current, v.currentTime || 0);
    } else if (!isPlaying && !v.paused) {
      v.pause();
      audioEngine.stopAll();
    }
  }, [isPlaying, videoRef, videoUrl]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const clamped = Math.max(0, Math.min(t, v.duration || videoDuration));
      v.currentTime = clamped;
      syncFromVideo(clamped);
      if (isPlaying) {
        void audioEngine.syncPlay(cuesRef.current, clamped);
      } else {
        audioEngine.stopAll();
      }
    },
    [videoRef, videoDuration, isPlaying, syncFromVideo],
  );

  const step = (delta: number) => {
    seekTo((videoRef.current?.currentTime ?? 0) + delta);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-200">
          <Film size={14} className="text-accent" /> VIDEO PREVIEW
        </h2>
        <div className="font-mono text-xs tabular-nums text-zinc-300">
          <span className="text-accent">{toTimecode(currentTime)}</span>
          <span className="text-zinc-500"> / {toTimecode(videoDuration)}</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-line bg-black">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="aspect-video w-full bg-black object-contain"
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                setVideoDuration(Math.min(d, 60));
                setStatus(`Loaded video — duration ${d.toFixed(1)}s`);
              }
            }}
            onTimeUpdate={(e) => syncFromVideo(e.currentTarget.currentTime)}
            onSeeked={(e) => syncFromVideo(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              audioEngine.stopAll();
            }}
            onEnded={() => {
              if (loopEnabled) {
                const v = videoRef.current;
                if (v) {
                  v.currentTime = 0;
                  void v.play().catch(() => undefined);
                  void audioEngine.syncPlay(cuesRef.current, 0);
                }
              } else {
                setPlaying(false);
                audioEngine.stopAll();
              }
            }}
            onError={() => {
              setStatus("Could not load video. Try uploading a .mp4 or switching presets.");
            }}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-base text-center text-sm text-zinc-500">
            No video loaded — pick a demo preset or upload a file.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => step(-1 / 24)}
          className="rounded-md border border-line p-2 text-zinc-200 hover:border-accent"
          aria-label="Step back one frame"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={toggle}
          disabled={!videoUrl}
          className="flex h-9 w-12 items-center justify-center rounded-md bg-accent text-white hover:bg-highlight disabled:opacity-50"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={() => step(1 / 24)}
          className="rounded-md border border-line p-2 text-zinc-200 hover:border-accent"
          aria-label="Step forward one frame"
        >
          <SkipForward size={14} />
        </button>
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={Math.max(videoDuration, 1)}
          step={0.042}
          defaultValue={0}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[#8B5CF6]"
          aria-label="Seek through video"
        />
        <span className="hidden font-mono text-[11px] text-zinc-500 sm:block">
          {currentTime.toFixed(3)}s
        </span>
      </div>
    </div>
  );
}
