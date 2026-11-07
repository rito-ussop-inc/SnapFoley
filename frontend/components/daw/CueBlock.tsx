"use client";

import { useEffect, useRef, useState } from "react";
import { VolumeX } from "lucide-react";
import type { FoleyCue } from "@/lib/types";
import { useFoleyStore } from "@/store/useFoleyStore";
import { audioEngine } from "@/lib/audio/AudioEngine";

const TRACK_COLORS = ["#38bdf8", "#8B5CF6", "#A855F7", "#f59e0b"];

interface CueBlockProps {
  cue: FoleyCue;
  totalDuration: number;
  trackHeight?: number;
  peaks: number[];
}

export function CueBlock({ cue, totalDuration, peaks }: CueBlockProps) {
  const { selectedCueId, setSelectedCueId, updateCue } = useFoleyStore();
  const selected = selectedCueId === cue.id;
  const ref = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState<number | null>(null);
  const [peaksLocal, setPeaksLocal] = useState<number[]>(peaks);

  useEffect(() => {
    if (peaks.length > 0) setPeaksLocal(peaks);
  }, [peaks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (peaksLocal.length === 0) {
        const buf = await audioEngine.getBuffer(cue);
        if (buf && !cancelled) {
          setPeaksLocal(audioEngine.getPeaks(cue, 48));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue.id, cue.audioUrl]);

  const leftPct = (cue.timestamp / totalDuration) * 100;
  const widthPct = Math.max((cue.duration / totalDuration) * 100, 1.2);
  const color = TRACK_COLORS[cue.trackIndex] ?? "#8B5CF6";
  const displayLeft = dragX !== null ? `${dragX}%` : `${leftPct}%`;

  const onPointerDown = (e: React.PointerEvent) => {
    setSelectedCueId(cue.id);
    const el = ref.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const lane = el.parentElement;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const startX = e.clientX;
    const startTimestamp = cue.timestamp;
    const widthPx = rect.width;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dt = (dx / widthPx) * totalDuration;
      const next = Math.max(0, Math.min(totalDuration - cue.duration, startTimestamp + dt));
      // Snap to 1/24 frame (~41.7ms) for frame accuracy.
      const snapped = Math.round(next * 24) / 24;
      setDragX((snapped / totalDuration) * 100);
      updateCue(cue.id, { timestamp: snapped });
    };
    const up = () => {
      setDragX(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Cue ${cue.id}`}
      onPointerDown={onPointerDown}
      onClick={() => setSelectedCueId(cue.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSelectedCueId(cue.id);
        }
      }}
      className={`group absolute top-1 bottom-1 cursor-grab rounded-md border px-1 py-0.5 active:cursor-grabbing ${
        selected
          ? "z-20 border-white shadow-[0_0_14px_rgba(168,85,247,0.55)]"
          : "z-10 border-white/20 hover:border-white/50"
      } ${cue.isMuted ? "opacity-50" : ""}`}
      style={{
        left: displayLeft,
        width: `${widthPct}%`,
        minWidth: 26,
        background: `linear-gradient(180deg, ${color}55, ${color}33)`,
        touchAction: "none",
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 overflow-hidden">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="truncate text-[9px] font-medium text-white/90">
            {cue.category}
          </span>
          {cue.isMuted && <VolumeX size={9} className="shrink-0 text-white/70" />}
          <span className="ml-auto hidden font-mono text-[8px] text-white/60 group-[.min-w-[80px]]:block">
            {cue.timestamp.toFixed(2)}s
          </span>
        </div>
        <Waveform peaks={peaksLocal} color={color} selected={selected} />
      </div>
    </div>
  );
}

function Waveform({
  peaks,
  color,
  selected,
}: {
  peaks: number[];
  color: string;
  selected: boolean;
}) {
  if (peaks.length === 0) {
    // Placeholder shimmer until decoded.
    return (
      <div className="mt-0.5 flex flex-1 items-center gap-px overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-px bg-white/30"
            style={{ height: `${30 + ((i * 37) % 50)}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="mt-0.5 flex flex-1 items-center gap-px overflow-hidden">
      {peaks.map((p, i) => (
        <div
          key={i}
          className="min-w-px flex-1"
          style={{
            height: `${Math.max(8, p * 100)}%`,
            background: selected ? "#ffffff" : color,
            opacity: 0.75,
          }}
        />
      ))}
    </div>
  );
}
