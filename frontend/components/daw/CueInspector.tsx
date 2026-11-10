"use client";

import { Loader2, Play, RefreshCw, Trash2, Volume2, VolumeX } from "lucide-react";
import type { FoleyCategory } from "@/lib/types";
import { categoryToTrack } from "@/lib/types";
import { useFoleyStore, BACKEND_BASE } from "@/store/useFoleyStore";
import { audioEngine } from "@/lib/audio/AudioEngine";

const CATEGORIES: FoleyCategory[] = [
  "Footsteps",
  "Foley/Props",
  "Impact",
  "Atmosphere",
];

interface CueInspectorProps {
  onRegenerate: (cueId: string, prompt: string, duration: number) => Promise<void>;
}

export function CueInspector({ onRegenerate }: CueInspectorProps) {
  const { cues, selectedCueId, updateCue, deleteCue, isRegenerating, setRegenerating } =
    useFoleyStore();
  const cue = cues.find((c) => c.id === selectedCueId) ?? null;

  if (!cue) {
    return (
      <section className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-panel/60 px-6 text-center">
        <p className="font-serif text-[15px] font-semibold text-ink">No cue selected</p>
        <p className="text-xs text-muted">
          Click a block on the timeline to edit its prompt, timing, volume and pan.
        </p>
        <p className="text-[11px] text-faint">
          Tip: press Space to play/pause, Delete to remove.
        </p>
      </section>
    );
  }

  const handleRegenerate = async () => {
    const prompt = cue.prompt.trim() || cue.prompt;
    setRegenerating(true);
    try {
      await onRegenerate(cue.id, prompt, cue.duration);
    } finally {
      setRegenerating(false);
    }
  };

  const handlePreview = async () => {
    const fresh = useFoleyStore.getState().cues.find((c) => c.id === cue.id) ?? cue;
    await audioEngine.preview(fresh);
  };

  return (
    <section className="card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="kicker">Inspector</p>
          <h2 className="mt-1 font-serif text-[15px] font-semibold tracking-tight text-ink">
            Cue details
          </h2>
          <p className="mt-1 truncate font-mono text-[10px] text-accent">{cue.id}</p>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          className="btn h-8 shrink-0 px-2"
          title="Audition this cue now"
        >
          <Play size={12} /> Preview
        </button>
      </div>

      <label className="block">
        <span className="kicker mb-1.5 block">Acoustic prompt</span>
        <textarea
          value={cue.prompt}
          onChange={(e) => updateCue(cue.id, { prompt: e.target.value })}
          rows={3}
          className="field resize-none leading-relaxed"
          placeholder="Describe the sound physically…"
        />
      </label>

      <button
        type="button"
        onClick={handleRegenerate}
        disabled={isRegenerating}
        className="btn btn-primary w-full py-2"
      >
        {isRegenerating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {isRegenerating ? "Regenerating take…" : "Regenerate take"}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="kicker mb-1.5 block">Category</span>
          <select
            value={cue.category}
            onChange={(e) => {
              const cat = e.target.value as FoleyCategory;
              updateCue(cue.id, {
                category: cat,
                trackIndex: categoryToTrack(cat),
              });
            }}
            className="field cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="kicker mb-1.5 block">Track</span>
          <select
            value={cue.trackIndex}
            onChange={(e) => updateCue(cue.id, { trackIndex: Number(e.target.value) })}
            className="field cursor-pointer"
          >
            <option value={0}>0 · Atmosphere</option>
            <option value={1}>1 · Footsteps</option>
            <option value={2}>2 · Foley/Props</option>
            <option value={3}>3 · Impacts</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="kicker mb-1.5 block">Start (s)</span>
          <input
            type="number"
            min={0}
            step={0.042}
            value={Number(cue.timestamp.toFixed(3))}
            onChange={(e) =>
              updateCue(cue.id, { timestamp: Math.max(0, Number(e.target.value) || 0) })
            }
            className="field font-mono"
          />
        </label>
        <label className="block">
          <span className="kicker mb-1.5 block">Duration (s)</span>
          <input
            type="number"
            min={0.2}
            max={3}
            step={0.05}
            value={Number(cue.duration.toFixed(2))}
            onChange={(e) =>
              updateCue(cue.id, {
                duration: Math.max(0.2, Math.min(3, Number(e.target.value) || 0.2)),
              })
            }
            className="field font-mono"
          />
        </label>
      </div>

      <div className="space-y-3 border-t border-line pt-3">
        <label className="block">
          <span className="mb-1 flex items-center justify-between">
            <span className="kicker">Volume</span>
            <span className="font-mono text-[11px] text-ink">
              {Math.round(cue.volume * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={cue.volume}
            onChange={(e) => updateCue(cue.id, { volume: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between">
            <span className="kicker">Pan</span>
            <span className="font-mono text-[11px] text-ink">
              {cue.pan < -0.05 ? "L" : cue.pan > 0.05 ? "R" : "C"}{" "}
              {Math.abs(cue.pan).toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={cue.pan}
            onChange={(e) => updateCue(cue.id, { pan: Number(e.target.value) })}
            className="w-full"
          />
          <span className="flex justify-between font-mono text-[9px] text-faint">
            <span>L 100</span>
            <span>Center</span>
            <span>R 100</span>
          </span>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateCue(cue.id, { isMuted: !cue.isMuted })}
          aria-pressed={!!cue.isMuted}
          className={`btn flex-1 ${
            cue.isMuted
              ? "border-warm/50 bg-warm/10 text-warm"
              : ""
          }`}
        >
          {cue.isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {cue.isMuted ? "Muted" : "Mute"}
        </button>
        <button
          type="button"
          onClick={() => deleteCue(cue.id)}
          className="btn flex-1 border-danger/40 bg-danger/10 text-danger hover:border-danger/70 hover:bg-danger/15"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>

      <p className="border-t border-line pt-2 text-[10px] leading-relaxed text-faint">
        Backend <span className="font-mono text-muted">{BACKEND_BASE}</span> — regenerate
        falls back to the cached take when the backend is offline.
      </p>
    </section>
  );
}
