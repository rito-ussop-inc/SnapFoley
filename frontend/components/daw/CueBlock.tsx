"use client";

import { useRef, useState } from "react";
import { VolumeX } from "lucide-react";
import type { FoleyCue } from "@/lib/types";
import { useFoleyStore } from "@/store/useFoleyStore";

interface CueBlockProps {
  cue: FoleyCue;
  totalDuration: number;
  peaks: number[];
}

export function CueBlock({ cue, totalDuration, peaks }: CueBlockProps) {
  const { selectedCueId, setSelectedCueId, updateCue } = useFoleyStore();
  const selected = selectedCueId === cue.id;
  const ref = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState<number | null>(null);

  const leftPct = (cue.timestamp / totalDuration) * 100;
  const widthPct = Math.max((cue.duration / totalDuration) * 100, 1.2);
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
      data-cue-block
      data-selected={selected}
      data-muted={!!cue.isMuted}
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
      className="cue-block"
      style={
        {
          "--cue": `var(--track-${cue.trackIndex})`,
          left: displayLeft,
          width: `${widthPct}%`,
          minWidth: 28,
        } as React.CSSProperties
      }
    >
      <div className="flex h-full flex-col px-1.5 py-1">
        <div className="flex items-center gap-1 overflow-hidden">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--cue)" }}
          />
          <span className="truncate text-[9px] font-semibold tracking-wide text-ink/85">
            {cue.category}
          </span>
          {cue.isMuted && <VolumeX size={9} className="shrink-0 text-ink/60" />}
          <span className="ml-auto hidden shrink-0 font-mono text-[8px] text-ink/55 min-[900px]:block">
            {cue.timestamp.toFixed(2)}s
          </span>
        </div>
        <Waveform peaks={peaks} />
      </div>
    </div>
  );
}

function Waveform({ peaks }: { peaks: number[] }) {
  if (peaks.length === 0) {
    // Placeholder shimmer until decoded.
    return (
      <div className="cue-wave mt-1 flex-1">
        {Array.from({ length: 20 }).map((_, i) => (
          <span key={i} style={{ height: `${30 + ((i * 37) % 50)}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="cue-wave mt-1 flex-1">
      {peaks.map((p, i) => (
        <span key={i} style={{ height: `${Math.max(8, p * 100)}%` }} />
      ))}
    </div>
  );
}
