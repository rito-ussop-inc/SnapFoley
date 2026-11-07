"""Procedural mock SFX synthesizer (stdlib only, no ffmpeg/numpy).

Generates deterministic 16-bit mono WAVs keyed by (category, prompt hash).
Distinct recipes per category so regenerate produces a stable variation.
"""
from __future__ import annotations

import hashlib
import math
import random
import struct
import wave

SR = 44100


def _h(seed: str) -> random.Random:
    digest = hashlib.sha256(seed.encode()).digest()
    return random.Random(int.from_bytes(digest[:4], "little"))


def _lowpass(samples: list[float], alpha: float) -> list[float]:
    out: list[float] = []
    y = 0.0
    for x in samples:
        y = alpha * x + (1 - alpha) * y
        out.append(y)
    return out


def _envelope(n: int, attack: float = 0.05, decay: float = 0.4) -> list[float]:
    env = []
    a = max(1, int(n * attack))
    d = max(1, int(n * decay))
    for i in range(n):
        if i < a:
            env.append(i / a)
        elif i > n - d:
            env.append(max(0.0, (n - i) / d) ** 1.2)
        else:
            env.append(1.0)
    return env


def _render(category: str, prompt: str, duration: float) -> list[float]:
    rng = _h(f"{category}::{prompt}")
    n = max(1, int(SR * duration))
    raw: list[float] = []

    cat = category.strip()

    if cat == "Footsteps":
        # Short thud: lowpassed noise burst + sine thump, fast decay.
        noise = [rng.uniform(-1, 1) for _ in range(n)]
        noise = _lowpass(noise, 0.18)
        # Boost low end.
        out = []
        for i, v in enumerate(noise):
            t = i / SR
            thump = math.sin(2 * math.pi * (90 - 40 * t) * t) * 0.5 * math.exp(-t * 14)
            out.append((v * 0.9 + thump) * math.exp(-t * 10))
        raw = out

    elif cat == "Impact":
        # Boom + clang mixture: pitch-dropping sine + metallic partials + noise.
        out = []
        f0 = rng.uniform(70, 110)
        partials = [1.0, 2.02, 2.74, 3.76, 5.4]
        amps = [0.7, 0.3, 0.22, 0.15, 0.08]
        for i in range(n):
            t = i / SR
            f = f0 * math.exp(-t * 1.8) + 30
            boom = math.sin(2 * math.pi * f * t) * math.exp(-t * 4.5)
            ring = sum(
                a * math.sin(2 * math.pi * p * 440 * t) * math.exp(-t * 9)
                for p, a in zip(partials, amps)
            ) * 0.35
            nz = rng.uniform(-1, 1) * math.exp(-t * 16) * 0.3
            out.append(boom * 0.75 + ring + nz)
        raw = out

    elif cat == "Atmosphere":
        # Brown-ish noise + slow LFO hum, loop-friendly.
        out = []
        brown = 0.0
        hum_freq = rng.uniform(70, 140)
        for i in range(n):
            t = i / SR
            white = rng.uniform(-1, 1)
            brown = (brown + 0.02 * white) / 1.02
            hum = math.sin(2 * math.pi * hum_freq * t) * 0.06 + math.sin(
                2 * math.pi * hum_freq * 2.01 * t
            ) * 0.03
            lfo = 0.7 + 0.3 * math.sin(2 * math.pi * 0.2 * t)
            out.append((brown * 2.2 + hum) * lfo * 0.5)
        raw = _lowpass(out, 0.35)

    elif cat == "Foley/Props":
        # Metallic stumble / sword-ish if prompt hints, else cloth-like noise.
        p = prompt.lower()
        if any(k in p for k in ("sword", "blade", "metal", "clang", "swing", "swoosh")):
            out = []
            for i in range(n):
                t = i / SR
                sweep = 300 + 2000 * (t / max(duration, 0.01))
                tone = math.sin(2 * math.pi * sweep * t) * math.exp(-t * 5)
                nz = rng.uniform(-1, 1) * math.exp(-t * 6) * 0.4
                out.append(tone * 0.5 + nz)
            raw = _lowpass(out, 0.5)
        else:
            noise = [rng.uniform(-1, 1) for _ in range(n)]
            raw = [v * math.exp(-(i / SR) * 3.5) * 0.8 for i, v in enumerate(noise)]

    else:
        raw = [rng.uniform(-1, 1) * 0.3 for _ in range(n)]

    env = _envelope(len(raw), attack=0.04, decay=0.45)
    out = [v * e for v, e in zip(raw, env)]

    # Normalize to avoid clipping.
    peak = max((abs(v) for v in out), default=0.0) or 1.0
    gain = 0.9 / peak
    return [max(-1.0, min(1.0, v * gain)) for v in out]


def synthesize_to_file(path: str, *, prompt: str, category: str, duration: float) -> None:
    samples = _render(category, prompt, duration)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", int(max(-32767, min(32767, s * 32767)))) for s in samples
        )
        wf.writeframes(frames)
