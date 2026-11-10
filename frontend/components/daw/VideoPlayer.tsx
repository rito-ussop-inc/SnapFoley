"use client";

import { useCallback, useEffect, useRef } from "react";
import { Film, Pause, Play, SkipBack, SkipForward } from "lucide-react";
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
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="kicker">Monitor</p>
          <h2 className="mt-1 font-serif text-[15px] font-semibold tracking-tight text-ink">
            Video preview
          </h2>
        </div>
        <div className="text-right font-mono text-[11px] tabular-nums">
          <span className="text-accent">{toTimecode(currentTime)}</span>
          <span className="text-faint"> / {toTimecode(videoDuration)}</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line bg-base">
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
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-base text-center">
            <Film size={22} className="text-faint" />
            <p className="text-sm text-muted">No video loaded</p>
            <p className="text-[11px] text-faint">Pick a demo preset or upload a file.</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => step(-1 / 24)}
          className="btn h-9 px-2"
          aria-label="Step back one frame"
          title="Step back one frame"
        >
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={!videoUrl}
          className="btn btn-primary h-9 w-11 px-0"
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          onClick={() => step(1 / 24)}
          className="btn h-9 px-2"
          aria-label="Step forward one frame"
          title="Step forward one frame"
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
          className="mx-1 min-w-0 flex-1"
          aria-label="Seek through video"
        />
        <span className="hidden w-[74px] shrink-0 text-right font-mono text-[10px] text-faint sm:block">
          {currentTime.toFixed(2)}s
        </span>
      </div>
    </section>
  );
}
