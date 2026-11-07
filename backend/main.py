"""SnapFoley FastAPI backend — AI orchestration & media processing.

Endpoints:
  GET  /api/health
  GET  /api/config
  POST /api/analyze-video   (multipart file OR JSON {videoId, videoUrl})
  POST /api/synthesize-cue  ({cueId, prompt, duration, category})
  GET  /api/demo-manifest?preset=demo1|demo2
  GET  /static/...          (serves generated WAVs)

Without API keys this service degrades gracefully to deterministic mock
cues + procedural WAV synthesis (stdlib `wave`, no ffmpeg required).
"""
from __future__ import annotations

import json
import math
import os
import random
import struct
import time
import uuid
import wave
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from audio_synth import synthesize_to_file

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static" / "audio"
UPLOADS_DIR = BASE_DIR / "uploads"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="SnapFoley Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


# ---------------------------------------------------------------- models ---

class AnalyzeRequest(BaseModel):
    videoId: str = "unknown"
    videoUrl: str = ""


class SynthesizeRequest(BaseModel):
    cueId: str
    prompt: str = ""
    duration: float = 1.0
    category: str = "Foley/Props"


class CueOut(BaseModel):
    id: str
    trackIndex: int
    category: str
    timestamp: float
    duration: float
    prompt: str
    audioUrl: str
    volume: float = 1.0
    pan: float = 0.0
    isMuted: bool = False


CATEGORY_TRACK = {
    "Atmosphere": 0,
    "Footsteps": 1,
    "Foley/Props": 2,
    "Impact": 3,
}


def _seeded_rng(seed: str) -> random.Random:
    return random.Random(int.from_bytes(seed.encode()[:8], "little") % (2**32))


def mock_cues(video_id: str, video_duration: float = 15.0) -> list[CueOut]:
    """Deterministic fallback cues — mirrors frontend/mock/demoManifest."""
    dur = max(8.0, min(video_duration, 60.0))
    t = min(dur, 15.0)  # demo lays out first 15s; manifest retimes in frontend
    steps = [1.0, 2.1, 3.2, 4.6, 5.9]
    cues: list[CueOut] = [
        CueOut(
            id=f"{video_id}-amb-1",
            trackIndex=0,
            category="Atmosphere",
            timestamp=0.0,
            duration=3.0,
            prompt="Low room tone with distant ambience, empty space reverb",
            audioUrl="/audio/ambience_wind.wav",
            volume=0.55,
            pan=0.0,
        )
    ]
    pans = [-0.3, 0.25, -0.2, 0.4, -0.1]
    for i, ts in enumerate(steps):
        if ts < t:
            cues.append(
                CueOut(
                    id=f"{video_id}-step-{i+1}",
                    trackIndex=1,
                    category="Footsteps",
                    timestamp=ts,
                    duration=0.35,
                    prompt="Hard boot step on concrete, close-mic, slight echo",
                    audioUrl="/audio/step_concrete.wav",
                    volume=1.0,
                    pan=pans[i],
                )
            )
    cues.extend(
        [
            CueOut(
                id=f"{video_id}-rustle-1",
                trackIndex=2,
                category="Foley/Props",
                timestamp=2.8,
                duration=0.6,
                prompt="Heavy cloth rustle, jacket swish during movement",
                audioUrl="/audio/rustle_cloth.wav",
                volume=0.7,
                pan=0.0,
            ),
            CueOut(
                id=f"{video_id}-swoosh-1",
                trackIndex=3,
                category="Impact",
                timestamp=6.2,
                duration=0.9,
                prompt="Fast swoosh through air, blade whistle",
                audioUrl="/audio/sword_swoosh.wav",
                volume=1.0,
                pan=0.4,
            ),
            CueOut(
                id=f"{video_id}-clang-1",
                trackIndex=3,
                category="Impact",
                timestamp=7.1,
                duration=1.2,
                prompt="Steel clang, metallic ring with sharp attack",
                audioUrl="/audio/sword_clang.wav",
                volume=1.05,
                pan=-0.1,
            ),
            CueOut(
                id=f"{video_id}-boom-1",
                trackIndex=3,
                category="Impact",
                timestamp=10.5,
                duration=1.5,
                prompt="Heavy impact boom, body landing, sub thump",
                audioUrl="/audio/impact_boom.wav",
                volume=1.1,
                pan=0.0,
            ),
        ]
    )
    return [c for c in cues if c.timestamp < dur]


def _try_gemini_analysis(video_path: Path | None, video_id: str) -> list[CueOut] | None:
    """Attempt Gemini 2.0/2.5 Flash video analysis. Returns None on any failure."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key or video_path is None or not video_path.exists():
        return None
    try:
        from google import genai  # type: ignore

        client = genai.Client(api_key=api_key)
        model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        prompt = (
            "You are a Foley spotter for a DAW. Analyze this silent video and list every "
            "physical contact / sound event (footsteps, impacts, cloth, ambience) with "
            "precise start timestamps in seconds. Return ONLY valid JSON matching this schema: "
            '{"cues": [{"id": "string", "trackIndex": 0-3, "category": "Footsteps"|"Foley/Props"|"Impact"|"Atmosphere", '
            '"timestamp": number, "duration": 0.2-3.0, "prompt": "detailed acoustic description", '
            '"audioUrl": "/audio/mock.wav", "volume": 0.0-1.5, "pan": -1.0 to 1.0}]}. '
            "trackIndex mapping: 0 Atmosphere, 1 Footsteps, 2 Foley/Props, 3 Impact. "
            "pan reflects screen position (left=-1, right=1). "
            f"Prefix every id with '{video_id}-'. Keep cues <= 20."
        )
        gen_file = client.files.upload(file=str(video_path))
        response = client.models.generate_content(
            model=model,
            contents=[gen_file, prompt],
        )
        text = (response.text or "").strip()
        # Strip markdown fences if present.
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.lower().startswith("json"):
                text = text[4:]
        data = json.loads(text)
        raw = data.get("cues", data) if isinstance(data, dict) else data
        out: list[CueOut] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            cue = CueOut(
                id=str(item.get("id", f"{video_id}-{uuid.uuid4().hex[:6]}")),
                trackIndex=int(item.get("trackIndex", CATEGORY_TRACK.get(str(item.get("category")), 2))),
                category=str(item.get("category", "Foley/Props")),
                timestamp=float(item.get("timestamp", 0.0)),
                duration=float(item.get("duration", 1.0)),
                prompt=str(item.get("prompt", "")),
                audioUrl=str(item.get("audioUrl", "/audio/mock.wav")),
                volume=float(item.get("volume", 1.0)),
                pan=float(item.get("pan", 0.0)),
            )
            cue.duration = max(0.2, min(3.0, cue.duration))
            cue.pan = max(-1.0, min(1.0, cue.pan))
            cue.volume = max(0.0, min(1.5, cue.volume))
            cue.trackIndex = max(0, min(3, cue.trackIndex))
            if cue.category not in CATEGORY_TRACK:
                cue.category = ["Atmosphere", "Footsteps", "Foley/Props", "Impact"][cue.trackIndex]
            out.append(cue)
        return out or None
    except Exception:
        return None


# ---------------------------------------------------------------- routes ---

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "SnapFoley Backend", "time": time.time()}


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {
        "geminiConfigured": bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
        "elevenlabsConfigured": bool(os.getenv("ELEVENLABS_API_KEY")),
        "geminiModel": os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        "note": "API keys are server-side only. Without keys, mock synthesis is used.",
    }


@app.get("/api/demo-manifest")
def demo_manifest(preset: str = "demo2") -> dict[str, Any]:
    video_id = "demo-scifi-walk" if preset == "demo1" else "demo-combat"
    cues = mock_cues(video_id, 15.0)
    return {"videoId": video_id, "videoDuration": 15.0, "cues": [c.model_dump() for c in cues]}


@app.post("/api/analyze-video")
async def analyze_video(
    file: Optional[UploadFile] = File(default=None),
    body: Optional[AnalyzeRequest] = None,
) -> JSONResponse:
    video_id = "video"
    video_duration = 15.0
    saved_path: Path | None = None

    if file is not None and file.filename:
        video_id = f"upload-{uuid.uuid4().hex[:8]}"
        ext = Path(file.filename).suffix or ".mp4"
        saved_path = UPLOADS_DIR / f"{video_id}{ext}"
        data = await file.read()
        if len(data) > 50 * 1024 * 1024:
            return JSONResponse({"error": "File exceeds 50 MB demo limit"}, status_code=400)
        saved_path.write_bytes(data)
        # Without ffmpeg we can't probe duration reliably; keep 15s default and
        # let the frontend reconcile with HTMLVideoElement metadata.
        video_duration = 15.0
    elif body is not None:
        video_id = body.videoId or video_id

    cues = _try_gemini_analysis(saved_path, video_id)
    engine = "gemini" if cues else "mock"
    if cues is None:
        rng = _seeded_rng(video_id)
        cues = mock_cues(video_id, video_duration)
        for c in cues:  # slight deterministic jitter per video id
            if rng.random() < 0.3:
                c.pan = max(-1.0, min(1.0, c.pan + rng.uniform(-0.1, 0.1)))

    return JSONResponse(
        {
            "videoId": video_id,
            "videoDuration": video_duration,
            "engine": engine,
            "cues": [c.model_dump() for c in cues],
        }
    )


@app.post("/api/synthesize-cue")
async def synthesize_cue(req: SynthesizeRequest) -> JSONResponse:
    """ElevenLabs SFX if configured, else procedural mock synthesizer."""
    safe_id = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in req.cueId)
    out_path = STATIC_DIR / f"{safe_id}.wav"

    eleven = os.getenv("ELEVENLABS_API_KEY")
    if eleven:
        try:
            ok = await _try_elevenlabs(eleven, req, out_path)
            if ok and out_path.exists():
                return {"audioUrl": f"/static/audio/{out_path.name}", "engine": "elevenlabs"}
        except Exception:
            pass

    synthesize_to_file(
        str(out_path),
        prompt=req.prompt or req.category,
        category=req.category,
        duration=max(0.2, min(3.0, req.duration)),
    )
    return {"audioUrl": f"/static/audio/{out_path.name}", "engine": "mock"}


async def _try_elevenlabs(api_key: str, req: SynthesizeRequest, out_path: Path) -> bool:
    import httpx

    prompt = req.prompt or f"A {req.category} sound effect"
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            "https://api.elevenlabs.io/v1/sound-generation",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={"text": prompt, "duration_seconds": max(0.2, min(3.0, req.duration))},
        )
        if res.status_code != 200:
            return False
        blob = res.content
        # ElevenLabs returns audio bytes; write raw (may be mp3). Name honestly.
        if blob[:4] == b"RIFF":
            out_path.write_bytes(blob)
        else:
            out_path = out_path.with_suffix(".mp3")
            out_path.write_bytes(blob)
        return out_path.exists()


@app.get("/audio/{name}")
def legacy_audio(name: str) -> FileResponse:
    """Serve generated demo WAVs from static/audio for /audio/*.wav URLs."""
    path = STATIC_DIR / name
    if path.exists():
        return FileResponse(path, media_type="audio/wav")
    # Fall back to frontend public/audio if present (dev convenience).
    alt = BASE_DIR.parent / "frontend" / "public" / "audio" / name
    if alt.exists():
        return FileResponse(alt, media_type="audio/wav")
    return JSONResponse({"error": "audio not found"}, status_code=404)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "SnapFoley Backend",
        "docs": "/docs",
        "health": "/api/health",
        "config": "/api/config",
        "analyze": "POST /api/analyze-video",
        "synthesize": "POST /api/synthesize-cue",
    }
