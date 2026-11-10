"use client";

import { useEffect, useRef } from "react";

/**
 * Emits continuous millisecond timestamps from an HTMLVideoElement.
 * Uses requestAnimationFrame while playing for smooth playhead motion,
 * and timeupdate/seeked listeners otherwise.
 */
export function usePlaybackClock(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onTime: (t: number) => void,
  isPlaying: boolean,
) {
  const cbRef = useRef(onTime);
  useEffect(() => {
    cbRef.current = onTime;
  }, [onTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const push = () => cbRef.current(video.currentTime || 0);

    const handleTimeUpdate = () => push();
    const handleSeeked = () => push();
    const handleLoaded = () => push();

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("loadedmetadata", handleLoaded);
    push();

    let raf = 0;
    const loop = () => {
      push();
      raf = requestAnimationFrame(loop);
    };
    if (isPlaying) {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("loadedmetadata", handleLoaded);
    };
  }, [videoRef, isPlaying]);
}
