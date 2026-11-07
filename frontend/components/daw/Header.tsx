"use client";

import { useRef } from "react";
import {
  AudioWaveform,
  Download,
  FileAudio,
  Upload,
  Wand2,
  Loader2,
  Repeat,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useFoleyStore } from "@/store/useFoleyStore";
import { DEMO_VIDEO_PRESETS } from "@/mock/demoManifest";

interface HeaderProps {
  onAnalyze: () => void;
  onExportEdl: () => void;
  onExportZip: () => void;
  onSelectPreset: (id: "demo1" | "demo2") => void;
  onUploadFile: (file: File) => void;
  onCheckBackend: () => void;
}

export function Header({
  onAnalyze,
  onExportEdl,
  onExportZip,
  onSelectPreset,
  onUploadFile,
  onCheckBackend,
}: HeaderProps) {
  const {
    activePreset,
    demoMode,
    setDemoMode,
    isAnalyzing,
    isExporting,
    backendOnline,
    loopEnabled,
    setLoop,
    videoDuration,
    cues,
    statusMessage,
  } = useFoleyStore();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="border-b border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
            <AudioWaveform size={20} />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-wide text-white">
              SnapFoley
            </h1>
            <p className="text-[11px] text-zinc-400">
              AI Foley &amp; Multi-Track Sound Design Studio
            </p>
          </div>
        </div>

        <div className="hidden h-6 w-px bg-line md:block" />

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Demo video preset"
            value={activePreset === "demo1" || activePreset === "demo2" ? activePreset : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "demo1" || v === "demo2") onSelectPreset(v);
            }}
            className="rounded-md border border-line bg-base px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-accent"
          >
            <option value="" disabled>Demo videos</option>
            {DEMO_VIDEO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <input
            ref={fileRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-line bg-base px-2.5 py-1.5 text-xs text-zinc-200 hover:border-accent hover:text-white"
          >
            <Upload size={13} /> Upload .mp4/.mov
          </button>

          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-highlight disabled:opacity-60"
          >
            {isAnalyzing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {isAnalyzing ? "Analyzing..." : "Analyze & Spot Foley"}
          </button>

          <button
            onClick={() => setLoop(!loopEnabled)}
            aria-pressed={loopEnabled}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
              loopEnabled
                ? "border-accent bg-accent/15 text-white"
                : "border-line bg-base text-zinc-300"
            }`}
          >
            <Repeat size={13} /> Loop
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-base px-2.5 py-1 text-[11px] text-zinc-300">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                backendOnline === true
                  ? "bg-emerald-400"
                  : backendOnline === false
                    ? "bg-red-400"
                    : "bg-zinc-500"
              }`}
            />
            {backendOnline === null
              ? "Backend: checking..."
              : backendOnline
                ? "Backend online"
                : "Backend offline (demo fallback)"}
            <button
              onClick={onCheckBackend}
              title="Re-check backend"
              className="ml-1 text-accent hover:text-highlight"
              aria-label="Re-check backend connection"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
              className="accent-[#8B5CF6]"
            />
            Demo Mode
          </label>

          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-[11px] text-zinc-500">
              {cues.length} cues • {videoDuration.toFixed(1)}s
            </span>
          </div>

          <button
            onClick={onExportEdl}
            disabled={cues.length === 0 || isExporting}
            className="flex items-center gap-1.5 rounded-md border border-line bg-base px-2.5 py-1.5 text-xs text-zinc-200 hover:border-accent disabled:opacity-50"
          >
            <FileAudio size={13} /> .EDL
          </button>
          <button
            onClick={onExportZip}
            disabled={cues.length === 0 || isExporting}
            className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Stems ZIP
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[11px] text-zinc-400">
        <Zap size={11} className="text-accent" />
        <span>{statusMessage}</span>
      </div>
    </header>
  );
}
