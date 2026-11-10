"use client";

import { useRef } from "react";
import {
  AudioWaveform,
  Download,
  FileAudio,
  Loader2,
  RefreshCw,
  Repeat,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { useFoleyStore } from "@/store/useFoleyStore";
import { DEMO_VIDEO_PRESETS } from "@/mock/demoManifest";
import { ThemeToggle } from "./ThemeToggle";

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

  const backendLabel =
    backendOnline === null ? "Checking" : backendOnline ? "Online" : "Offline";

  return (
    <header className="top-0 z-40 border-b border-line bg-panel/85 backdrop-blur-md sm:sticky">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-line bg-panel2 text-accent">
              <AudioWaveform size={18} strokeWidth={2.2} />
            </div>
            <div className="leading-none">
              <h1 className="font-serif text-[19px] font-semibold tracking-tight text-ink">
                SnapFoley<span className="text-accent">.</span>
              </h1>
              <p className="kicker mt-1.5">Foley studio</p>
            </div>
          </div>

          <div className="mx-1 hidden h-7 w-px bg-line md:block" />

          {/* Primary actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Demo video preset"
              value={activePreset === "demo1" || activePreset === "demo2" ? activePreset : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "demo1" || v === "demo2") onSelectPreset(v);
              }}
              className="field h-8 w-[132px] cursor-pointer py-0 sm:w-[178px]"
            >
              <option value="" disabled>
                Demo videos
              </option>
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
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn h-8"
              title="Upload an .mp4 or .mov (max 50 MB)"
            >
              <Upload size={13} />
              <span>Upload</span>
              <span className="hidden sm:inline text-muted">.mp4/.mov</span>
            </button>

            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="btn btn-primary h-8"
            >
              {isAnalyzing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wand2 size={13} />
              )}
              {isAnalyzing ? (
                "Analyzing…"
              ) : (
                <>
                  Analyze<span className="hidden sm:inline">&nbsp;&amp; Spot Foley</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLoop(!loopEnabled)}
              aria-pressed={loopEnabled}
              className={`btn h-8 ${loopEnabled ? "btn-pressed" : ""}`}
              title="Loop playback"
            >
              <Repeat size={13} />
              <span className="hidden sm:inline">Loop</span>
            </button>
          </div>

          {/* Right cluster */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div
              className="hidden h-8 items-center gap-1.5 rounded-[9px] border border-line bg-panel px-2 text-[11px] text-muted sm:flex"
              title={
                backendOnline === true
                  ? "FastAPI backend reachable"
                  : backendOnline === false
                    ? "Backend offline — using cached demo assets"
                    : "Checking backend connection…"
              }
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  backendOnline === true
                    ? "bg-emerald-500"
                    : backendOnline === false
                      ? "bg-danger"
                      : "bg-faint"
                }`}
              />
              <span className="hidden lg:inline">Backend&nbsp;</span>
              {backendLabel}
              <button
                type="button"
                onClick={onCheckBackend}
                title="Re-check backend"
                className="ml-0.5 text-faint transition-colors hover:text-accent"
                aria-label="Re-check backend connection"
              >
                <RefreshCw size={11} />
              </button>
            </div>

            <label
              className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border px-2 text-[11px] transition-colors ${
                demoMode
                  ? "border-accent/50 bg-accent/10 text-ink"
                  : "border-line bg-panel text-muted"
              }`}
              title="Demo mode uses cached cue manifests and audio"
            >
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="hidden sm:inline">Demo Mode</span>
              <span className="sm:hidden">Demo</span>
            </label>

            <ThemeToggle />

            <div className="mx-0.5 hidden h-7 w-px bg-line sm:block" />

            <button
              type="button"
              onClick={onExportEdl}
              disabled={cues.length === 0 || isExporting}
              className="btn h-8"
              title="Export a CMX 3600 EDL at 24 fps"
            >
              <FileAudio size={13} /> .EDL
            </button>
            <button
              type="button"
              onClick={onExportZip}
              disabled={cues.length === 0 || isExporting}
              className="btn btn-solid h-8"
              title="Download stems, EDL and manifest as a ZIP"
            >
              {isExporting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              <span className="hidden sm:inline">Stems ZIP</span>
              <span className="sm:hidden">ZIP</span>
            </button>
          </div>
        </div>

        {/* Status line */}
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
          <Zap size={11} className="shrink-0 text-accent" />
          <span className="truncate">{statusMessage}</span>
          <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-faint sm:inline">
            {cues.length} cues · {videoDuration.toFixed(1)}s
          </span>
        </div>
      </div>
    </header>
  );
}
