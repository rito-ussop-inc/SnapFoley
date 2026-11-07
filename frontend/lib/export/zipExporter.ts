"use client";

import JSZip from "jszip";
import type { FoleyCue } from "@/lib/types";
import { buildEdl, fileNameForCue } from "@/lib/export/edlExporter";

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Build a production bundle zip: EDL + individual stems + manifest.json */
export async function downloadStemsZip(cues: FoleyCue[]) {
  const zip = new JSZip();
  const sorted = [...cues].sort((a, b) => a.timestamp - b.timestamp);
  zip.file("snapfoley_session.edl", buildEdl(sorted));
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        fps: 24,
        cues: sorted,
      },
      null,
      2,
    ),
  );

  const missing: string[] = [];
  for (const cue of sorted) {
    const name = fileNameForCue(cue);
    const blob = await fetchAsBlob(cue.audioUrl);
    if (blob) {
      zip.file(name, blob);
    } else {
      missing.push(`${name} (source ${cue.audioUrl})`);
    }
  }
  if (missing.length > 0) {
    zip.file("MISSING_AUDIO.txt", missing.join("\n"));
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = "snapfoley_stems.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
