"""Generate local offline demo MP4s (no silent dependence on remote samples).

Uses imageio (+ imageio-ffmpeg bundled ffmpeg) to render two 15s,
640x360, 24fps silent clips:
  - demo1_sci_fi_walk.mp4  (horizon + walking silhouette sweep)
  - demo2_combat_impact.mp4 (combat flashes / expanding rings)

Pure numpy-free PIL-free rendering with imageio + imageio-ffmpeg.
Run: python backend/generate_demo_videos.py
Output: frontend/public/video/*.mp4
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT_DIR = BASE / "frontend" / "public" / "video"
FPS = 24
DURATION = 15.0
W, H = 640, 360


def _frame_demo1(i: int):
    import numpy as np  # noqa: F401 - available via imageio dep chain

    t = i / FPS
    frame = np.zeros((H, W, 3), dtype="uint8")
    frame[:, :, 0] = 13
    frame[:, :, 1] = 18
    frame[:, :, 2] = 34
    # Horizon glow
    horizon = int(H * 0.62)
    frame[horizon:horizon + 2, :, 0] = 139
    frame[horizon:horizon + 2, :, 1] = 92
    frame[horizon:horizon + 2, :, 2] = 246
    # Ground
    frame[horizon + 2:, :, 0] = 9
    frame[horizon + 2:, :, 1] = 10
    frame[horizon + 2:, :, 2] = 15
    # Grid floor lines
    for gx in range(0, W, 64):
        frame[horizon:horizon + 40, gx:gx + 1, 0] = 30
        frame[horizon:horizon + 40, gx:gx + 1, 1] = 35
        frame[horizon:horizon + 40, gx:gx + 1, 2] = 55
    # Walking figure (stick) moving left->right, bobbing
    fx = int((t / DURATION) * (W - 120) + 60)
    fy = horizon - 55 + int(math.sin(t * math.pi * 2) * 4)
    # body
    frame[fy:fy + 34, fx:fx + 4, 0] = 168
    frame[fy:fy + 34, fx:fx + 4, 1] = 85
    frame[fy:fy + 34, fx:fx + 4, 2] = 247
    # head
    frame[fy - 12:fy, fx - 4:fx + 12, 0] = 168
    frame[fy - 12:fy, fx - 4:fx + 12, 1] = 85
    frame[fy - 12:fy, fx - 4:fx + 12, 2] = 247
    # legs oscillation
    leg = int(math.sin(t * math.pi * 4) * 18)
    frame[fy + 34:fy + 54, fx - 6 + leg:fx - 2 + leg, 0] = 139
    frame[fy + 34:fy + 54, fx - 6 + leg:fx - 2 + leg, 1] = 92
    frame[fy + 34:fy + 54, fx - 6 + leg:fx - 2 + leg, 2] = 246
    frame[fy + 34:fy + 54, fx + 6 - leg:fx + 10 - leg, 0] = 139
    frame[fy + 34:fy + 54, fx + 6 - leg:fx + 10 - leg, 1] = 92
    frame[fy + 34:fy + 54, fx + 6 - leg:fx + 10 - leg, 2] = 246
    # Timecode bar (top-left safe margin)
    sec = int(t)
    frame[8:20, 8:56, 0] = 30
    frame[8:20, 8:56, 1] = 35
    frame[8:20, 8:56, 2] = 55
    return frame


def _frame_demo2(i: int):
    import numpy as np  # noqa: F401

    t = i / FPS
    frame = np.zeros((H, W, 3), dtype="uint8")
    frame[:, :, 0] = 10
    frame[:, :, 1] = 12
    frame[:, :, 2] = 20
    cx, cy = W // 2, H // 2
    # Expanding impact rings at cue times
    for cue_t in (3.6, 4.8, 6.2, 7.1):
        age = t - cue_t
        if 0 <= age < 0.9:
            r = int(age * 260)
            frame[max(0, cy - r):cy + r, max(0, cx - r):cx + r, :] = (
                frame[max(0, cy - r):cy + r, max(0, cx - r):cx + r, :] * 0.7
            ).astype("uint8")
            frame[cy - 2:cy + 2, max(0, cx - r):cx + r, 0] = 245
            frame[cy - 2:cy + 2, max(0, cx - r):cx + r, 1] = 158
            frame[cy - 2:cy + 2, max(0, cx - r):cx + r, 2] = 11
            frame[max(0, cy - r):cy + r, cx - 2:cx + 2, 0] = 245
            frame[max(0, cy - r):cy + r, cx - 2:cx + 2, 1] = 158
            frame[max(0, cy - r):cy + r, cx - 2:cx + 2, 2] = 11
    # Sword line sweeping
    ang = math.sin(t * 1.2) * 0.9
    lx, ly = int(cx + math.cos(ang) * 140), int(cy + math.sin(ang) * 90)
    frame[min(ly, cy):max(ly, cy) + 1, min(lx, cx):max(lx, cx) + 1, 0] = 168
    frame[min(ly, cy):max(ly, cy) + 1, min(lx, cx):max(lx, cx) + 1, 1] = 85
    frame[min(ly, cy):max(ly, cy) + 1, min(lx, cx):max(lx, cx) + 1, 2] = 247
    # Footsteps dots along bottom
    for k, st in enumerate((1.2, 2.0, 2.8, 9.2)):
        if t >= st:
            alpha = max(0, 1 - (t - st) / 2)
            x = int(60 + k * 40 + (t - st) * 30)
            if 0 < x < W - 6 and 0 < 300 < H - 6:
                v = int(120 * alpha)
                frame[300:306, x:x + 6, 0] = 139 + v // 3
                frame[300:306, x:x + 6, 1] = 92 + v // 3
                frame[300:306, x:x + 6, 2] = 246
    return frame


def main() -> None:
    import imageio.v2 as imageio

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n = int(FPS * DURATION)
    for name, fn in (
        ("demo1-sci-fi-walk.mp4", _frame_demo1),
        ("demo2-combat-impact.mp4", _frame_demo2),
    ):
        out = OUT_DIR / name
        with imageio.get_writer(out, fps=FPS, codec="libx264", quality=7) as w:
            for i in range(n):
                w.append_data(fn(i))
        print(f"wrote {out} ({n} frames @ {FPS}fps) size={out.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
