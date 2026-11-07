"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  VolumeX,
  Volume2,
} from "lucide-react";
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
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onRegenerate: (cueId: string, prompt: string, duration: number) => Promise<void>;
}

export function CueInspector({ videoRef, onRegenerate }: CueInspectorProps) {
  const { cues, selectedCueId, updateCue, deleteCue, isRegenerating, setRegenerating } =
    useFoleyStore();
  const cue = cues.find((c) => c.id === selectedCueId) ?? null;
  const [localPrompt, setLocalPrompt] = useState("");

  useEffect(() => {
    setLocalPrompt(cue?.prompt ?? "");
  }, [cue?.id, cue?.prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cue) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel px-6 text-center text-sm text-zinc-500">
        <p className="font-medium text-zinc-300">No cue selected</p>
        <p className="text-xs">
          Click a block on the timeline to edit its prompt, timing, volume and pan.
        </p>
        <p className="text-[11px]">Tip: press Space to play/pause, Delete to remove.</p>
      </div>
    );
  }

  const handleRegenerate = async () => {
    const prompt = localPrompt.trim() || cue.prompt;
    updateCue(cue.id, { prompt });
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
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-zinc-200">
            CUE INSPECTOR
          </h2>
          <p className="font-mono text-[11px] text-accent">{cue.id}</p>
        </div>
        <button
          onClick={handlePreview}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-zinc-200 hover:border-accent"
          title="Audition this cue now"
        >
          <Play size={12} /> Preview
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-zinc-400">
          Acoustic prompt
        </span>
        <textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-accent"
          placeholder="Describe the sound physically…"
        />
      </label>

      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-highlight disabled:opacity-60"
      >
        {isRegenerating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {isRegenerating ? "Regenerating take..." : "Regenerate Take"}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">Category</span>
          <select
            value={cue.category}
            onChange={(e) => {
              const cat = e.target.value as FoleyCategory;
              updateCue(cue.id, {
                category: cat,
                trackIndex: categoryToTrack(cat),
              });
            }}
            className="w-full rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">Track</span>
          <select
            value={cue.trackIndex}
            onChange={(e) =>
              updateCue(cue.id, { trackIndex: Number(e.target.value) })
            }
            className="w-full rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-accent"
          >
            <option value={0}>0 Atmosphere</option>
            <option value={1}>1 Footsteps</option>
            <option value={2}>2 Foley/Props</option>
            <option value={3}>3 Impacts</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">Start (s)</span>
          <input
            type="number"
            min={0}
            step={0.042}
            value={Number(cue.timestamp.toFixed(3))}
            onChange={(e) =>
              updateCue(cue.id, { timestamp: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-full rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-400">Duration (s)</span>
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
            className="w-full rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Volume</span>
          <span className="font-mono text-zinc-200">{Math.round(cue.volume * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={cue.volume}
          onChange={(e) => updateCue(cue.id, { volume: Number(e.target.value) })}
          className="w-full accent-[#8B5CF6]"
        />
      </label>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Pan</span>
          <span className="font-mono text-zinc-200">
            {cue.pan < -0.05 ? "L" : cue.pan > 0.05 ? "R" : "C"}{" "}
            {cue.pan.toFixed(2)}
          </span>
        </span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={cue.pan}
          onChange={(e) => updateCue(cue.id, { pan: Number(e.target.value) })}
          className="w-full accent-[#8B5CF6]"
        />
        <span className="flex justify-between text-[9px] text-zinc-500">
          <span>Left 100%</span>
          <span>Center</span>
          <span>Right 100%</span>
        </span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={() => updateCue(cue.id, { isMuted: !cue.isMuted })}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
            cue.isMuted
              ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
              : "border-line text-zinc-200"
          }`}
          aria-pressed={!!cue.isMuted}
        >
          {cue.isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {cue.isMuted ? "Muted" : "Mute"}
        </button>
        <button
          onClick={() => deleteCue(cue.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500">
        Backend: <span className="font-mono">{BACKEND_BASE}</span> — regenerate falls back
        to the cached mock take if the backend is offline.
      </p>
    </div>
  );
}
