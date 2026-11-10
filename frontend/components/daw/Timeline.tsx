"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TRACKS, toTimecode } from "@/lib/types";
import { useFoleyStore } from "@/store/useFoleyStore";
import { CueBlock } from "./CueBlock";
import { audioEngine } from "@/lib/audio/AudioEngine";

interface TimelineProps {
  onSeek: (t: number) => void;
}

const TRACK_COLORS = [
  "var(--track-0)",
  "var(--track-1)",
  "var(--track-2)",
  "var(--track-3)",
];

export function Timeline({ onSeek }: TimelineProps) {
  const { cues, videoDuration, currentTime, selectedCueId } = useFoleyStore();
  const totalDuration = Math.max(videoDuration || 12, 8);
  const laneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [peaksMap, setPeaksMap] = useState<Map<string, number[]>>(new Map());

  const playheadPct = (Math.min(currentTime, totalDuration) / totalDuration) * 100;

  // Load waveform peaks for visible cues.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<string, number[]>();
      for (const c of cues) {
        const buf = await audioEngine.getBuffer(c);
        if (buf) next.set(c.id, audioEngine.getPeaks(c, 48));
      }
      if (!cancelled) setPeaksMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [cues]);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const lane = laneRefs.current[1] ?? laneRefs.current[0];
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * totalDuration);
    },
    [onSeek, totalDuration],
  );

  const rulerTicks = buildTicks(totalDuration);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-end justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <div>
          <p className="kicker">Arrangement</p>
          <h2 className="mt-1 font-serif text-[15px] font-semibold tracking-tight text-ink">
            Multi-track timeline
          </h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] tabular-nums text-accent">
            {toTimecode(currentTime)}
          </p>
          <p className="kicker mt-1">4 tracks</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[92px_1fr] sm:grid-cols-[128px_1fr]">
            {/* Track headers */}
            <div className="border-r border-line bg-surface/60">
              <div className="flex h-8 items-center border-b border-line px-2 sm:px-3">
                <span className="kicker">Track</span>
              </div>
              {TRACKS.map((t) => (
                <div
                  key={t.index}
                  className="flex h-14 items-center gap-2 border-b border-line px-2 last:border-b-0 sm:px-3"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TRACK_COLORS[t.index] }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-ink">
                      {t.label}
                    </div>
                    <div className="hidden truncate text-[9px] text-faint sm:block">
                      {t.category}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Lanes */}
            <div className="relative">
              {/* Ruler */}
              <div
                className="relative h-8 cursor-pointer border-b border-line bg-surface/40"
                onPointerDown={(e) => {
                  seekFromPointer(e.clientX);
                  const move = (ev: PointerEvent) => seekFromPointer(ev.clientX);
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              >
                {rulerTicks.map((t, i) => (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 border-l border-line/80"
                    style={{ left: `${(t / totalDuration) * 100}%` }}
                  >
                    <span className="block pl-1 pt-1 font-mono text-[9px] leading-none text-faint">
                      {i % 2 === 0 || totalDuration > 30 ? formatTick(t) : ""}
                    </span>
                  </div>
                ))}
              </div>

              {/* Lanes */}
              {TRACKS.map((track, li) => {
                const laneCues = cues.filter((c) => c.trackIndex === track.index);
                return (
                  <div
                    key={track.index}
                    ref={(el) => {
                      laneRefs.current[li] = el;
                    }}
                    className={`relative h-14 border-b border-line last:border-b-0 ${
                      li % 2 === 0 ? "bg-surface/25" : ""
                    }`}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest("[data-cue-block]")) return;
                    }}
                  >
                    {/* second grid lines */}
                    {rulerTicks.map((t) => (
                      <div
                        key={t}
                        className="pointer-events-none absolute top-0 bottom-0 border-l border-line/40"
                        style={{ left: `${(t / totalDuration) * 100}%` }}
                      />
                    ))}
                    {laneCues.map((cue) => (
                      <CueBlock
                        key={cue.id}
                        cue={cue}
                        totalDuration={totalDuration}
                        peaks={peaksMap.get(cue.id) ?? []}
                      />
                    ))}
                    {laneCues.length === 0 && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-faint/80">
                        {track.label} — no cues
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Playhead */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-accent shadow-[0_0_10px_var(--sf-accent)]"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="absolute -left-[4px] top-0 h-2 w-2 rotate-45 rounded-[1px] bg-accent" />
                <div className="absolute -left-[2px] bottom-0 h-1.5 w-1.5 rounded-full bg-accent" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[10px] text-faint sm:px-4">
        <span className="truncate">
          Selected: <span className="font-mono text-ink">{selectedCueId ?? "none"}</span>
        </span>
        <span className="text-line-strong">•</span>
        <span>{cues.length} cues total</span>
        <span className="ml-auto hidden text-faint sm:inline">
          Playhead syncs to the video clock
        </span>
      </div>
    </section>
  );
}

function buildTicks(total: number): number[] {
  const ticks: number[] = [];
  const step = total > 30 ? 5 : total > 15 ? 2 : 1;
  for (let t = 0; t <= total; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);
  return ticks;
}

function formatTick(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
