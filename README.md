# SnapFoley — Autonomous AI Foley & Multi-Track Sound Design Studio

Browser DAW for silent renders and video: multimodal cue spotting (Gemini Flash),
zero-shot SFX synthesis (ElevenLabs / procedural fallback), editable 4-track
timeline, and CMX 3600 EDL + stems ZIP export for DaVinci Resolve / Premiere Pro.

## Architecture

```
frontend/  Next.js App Router + TypeScript + Tailwind v4 + Zustand + Web Audio
backend/   FastAPI + Gemini vision + ElevenLabs SFX (+ procedural mock)
```

Data contract (`FoleyCue`):

```ts
type FoleyCategory = "Footsteps" | "Foley/Props" | "Impact" | "Atmosphere";
interface FoleyCue {
  id: string;
  trackIndex: number; // 0 Atmosphere, 1 Footsteps, 2 Foley/Props, 3 Impact
  category: FoleyCategory;
  timestamp: number;  // seconds
  duration: number;   // 0.2–3.0s
  prompt: string;
  audioUrl: string;
  volume: number;     // 0.0–1.5
  pan: number;        // -1.0–1.0
  isMuted?: boolean;
}
```

## Quickstart

### 1. Demo audio + video (generates offline assets)

```powershell
python backend/generate_demo_audio.py
python backend/generate_demo_videos.py   # needs imageio (pip install imageio imageio-ffmpeg)
```

Creates `frontend/public/audio/*.wav` (8 procedural SFX) and
`frontend/public/video/demo*.mp4` (two 15 s offline renders).
Regenerating is optional — the committed assets work out of the box.

### 2. Backend (optional for Demo Mode)

```powershell
pip install -r backend/requirements.txt
cd backend; python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Endpoints: `GET /api/health`, `GET /api/config`,
`POST /api/analyze-video` (multipart file **or** JSON `{videoId}`),
`POST /api/synthesize-cue`.

Without keys the backend returns deterministic mock cues + procedural WAVs.

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Demo Mode works with **zero API keys** and no backend: pick a demo preset,
press play, drag cue blocks, edit the inspector, export EDL/ZIP.

## Env

See `.env.example`.

- Backend: `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `GEMINI_MODEL=gemini-2.0-flash`,
  `ELEVENLABS_API_KEY`
- Frontend: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

## Features (per PRD/TRD)

- FR-1 Drag-and-drop `.mp4`/`.mov` (≤50 MB), custom transport (play/pause,
  scrub, frame step), `HH:MM:SS:FF` timecode, loop, demo presets.
- FR-2 Cue spotting with timestamp / duration / category / prompt / pan.
- FR-3 4-track timeline (Atmosphere / Footsteps / Foley-Props / Impacts),
  draggable frame-snapped blocks, waveform preview, selection.
- FR-4 Inspector: prompt + Regenerate Take, volume 0–150%, pan L100–R100,
  category/start/duration, mute, delete.
- FR-5 Export: CMX 3600 `.edl` (24 fps SMPTE), stems `.zip` (EDL + WAVs +
  manifest.json), mixdown via video + Web Audio (MP4 mux optional server-side).
- NFR: `#090A0F` / `#131622` / `#1E2337` dark DAW theme, `#8B5CF6`/`#A855F7`
  accents, ±20 ms sync budget, pre-decoded `AudioBuffer` scrubbing,
  5 ms gain ramps on stop (no clicks).
- Shortcuts: `Space` play/pause, `J/K/L` shuttle, `Delete` remove cue.

## Project layout

- `frontend/app/page.tsx` — DAW shell, upload, analyze/regenerate wiring
- `frontend/components/daw/{Header,VideoPlayer,Timeline,CueBlock,CueInspector}.tsx`
- `frontend/lib/{types,hooks/usePlaybackClock,audio/AudioEngine,export/*}.ts`
- `frontend/store/useFoleyStore.ts` + `frontend/mock/demoManifest.ts`
- `backend/main.py`, `backend/audio_synth.py`, `backend/generate_demo_audio.py`

## Verification

- `npm run build` (frontend) — passes.
- `POST /api/analyze-video` → mock cues without keys; Gemini when key set.
- `POST /api/synthesize-cue` → procedural WAV without keys; ElevenLabs when set.
- EDL validates at 24 fps; stems ZIP contains `snapfoley_session.edl`.
