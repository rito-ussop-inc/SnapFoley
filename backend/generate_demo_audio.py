"""Generate all demo WAVs (frontend/public/audio + backend/static/audio).

Run: python backend/generate_demo_audio.py
Uses only stdlib. Deterministic, no external assets.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_synth import synthesize_to_file

BASE = Path(__file__).resolve().parent.parent
FRONTEND_AUDIO = BASE / "frontend" / "public" / "audio"
BACKEND_AUDIO = BASE / "backend" / "static" / "audio"

JOBS: list[tuple[str, str, str, float]] = [
    # filename, category, prompt, duration
    ("ambience_wind.wav", "Atmosphere", "wind over open battlefield, low air", 3.0),
    ("hum_scifi.wav", "Atmosphere", "sci-fi hum, room tone with harmonic glow", 2.5),
    ("step_concrete.wav", "Footsteps", "hard boot step on wet concrete", 0.35),
    ("step_metal.wav", "Footsteps", "boot step on metal grate, hollow resonance", 0.35),
    ("rustle_cloth.wav", "Foley/Props", "heavy cloth rustle, jacket swish", 0.6),
    ("sword_swoosh.wav", "Impact", "katana swoosh through air", 0.9),
    ("sword_clang.wav", "Impact", "steel clang blade on blade", 1.2),
    ("impact_boom.wav", "Impact", "heavy impact boom body landing", 1.5),
]


def main() -> None:
    FRONTEND_AUDIO.mkdir(parents=True, exist_ok=True)
    BACKEND_AUDIO.mkdir(parents=True, exist_ok=True)
    for filename, category, prompt, duration in JOBS:
        synthesize_to_file(
            str(FRONTEND_AUDIO / filename),
            prompt=prompt,
            category=category,
            duration=duration,
        )
        synthesize_to_file(
            str(BACKEND_AUDIO / filename),
            prompt=prompt,
            category=category,
            duration=duration,
        )
        print(f"wrote {filename} ({duration:.1f}s, {category})")
    print("demo audio generation complete.")


if __name__ == "__main__":
    main()
