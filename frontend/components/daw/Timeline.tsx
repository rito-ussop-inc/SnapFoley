"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TRACKS, toTimecode } from "@/lib/types";
import { useFoleyStore } from "@/store/useFoleyStore";
import { CueBlock } from "./CueBlock";
import { audioEngine } from "@/lib/audio/AudioEngine";

interface TimelineProps {
  onSeek: (t: number) => void;
}

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
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-200">
          MULTI-TRACK TIMELINE
        </h2>
        <span className="font-mono text-[11px] text-zinc-400">
          {toTimecode(currentTime)} • 4 tracks • drag cues to nudge timing
        </span>
      </div>

      <div className="grid grid-cols-[128px_1fr]">
        {/* Track headers */}
        <div className="border-r border-line bg-base">
          <div className="flex h-8 items-center border-b border-line px-2 text-[10px] font-semibold tracking-wider text-zinc-500">
            TRACK
          </div>
          {TRACKS.map((t) => (
            <div
              key={t.index}
              className="flex h-14 items-center border-b border-line px-2"
            >
              <div>
                <div className="text-[10px] font-semibold text-zinc-300">
                  {t.index + 1}. {t.label}
                </div>
                <div className="text-[9px] text-zinc-500">{t.category}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Lanes */}
        <div className="relative">
          {/* Ruler */}
          <div
            className="relative h-8 cursor-pointer border-b border-line bg-base/60"
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
            {rulerTicks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-line/70 pl-1"
                style={{ left: `${(t / totalDuration) * 100}%` }}
              >
                <span className="block pt-0.5 font-mono text-[9px] text-zinc-500">
                  {toTimecode(t)}
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
                className="relative h-14 border-b border-line last:border-b-0"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("[data-cue-block]")) return;
                }}
              >
                {/* second grid lines */}
                {rulerTicks.map((t) => (
                  <div
                    key={t}
                    className="pointer-events-none absolute top-0 bottom-0 border-l border-line/30"
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
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600">
                    {track.label} — no cues
                  </div>
                )}
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-highlight shadow-[0_0_8px_#A855F7]"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="absolute -top-0 -left-[5px] h-2.5 w-2.5 rotate-45 bg-highlight" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[10px] text-zinc-500">
        <span>
          Selected:{" "}
          <span className="text-zinc-200">{selectedCueId ?? "none"}</span>
        </span>
        <span>•</span>
        <span>{cues.length} cues total</span>
        <span>•</span>
        <span>Playhead syncs to &lt;video&gt; clock (±20ms budget)</span>
      </div>
    </div>
  );
}

function buildTicks(total: number): number[] {
  const ticks: number[] = [];
  const step = total > 30 ? 5 : total > 15 ? 2 : 1;
  for (let t = 0; t <= total; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);
  return ticks;
}
