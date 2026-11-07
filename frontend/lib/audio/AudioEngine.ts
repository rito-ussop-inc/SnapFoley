"use client";

import type { FoleyCue } from "@/lib/types";

/**
 * Singleton wrapping window.AudioContext.
 * Caches decoded AudioBuffers keyed by cue.id + audioUrl.
 * Schedules cues sample-accurately relative to the video clock.
 * Stop uses 5ms linear gain ramps to avoid pops/clicks.
 */
class AudioEngineImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private activeSources = new Set<AudioBufferSourceNode>();
  private activeGains = new Set<GainNode>();
  private decodePromises = new Map<string, Promise<AudioBuffer | null>>();

  private key(cue: FoleyCue): string {
    return `${cue.id}::${cue.audioUrl}`;
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** Pre-decode all cue buffers. Safe to call repeatedly. */
  async preload(cues: FoleyCue[]): Promise<void> {
    await Promise.allSettled(cues.map((c) => this.getBuffer(c)));
  }

  async getBuffer(cue: FoleyCue): Promise<AudioBuffer | null> {
    const k = this.key(cue);
    const cached = this.bufferCache.get(k);
    if (cached) return cached;
    const inFlight = this.decodePromises.get(k);
    if (inFlight) return inFlight;
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(cue.audioUrl);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        // Copy because decodeAudioData detaches the buffer.
        const buf = await ctx.decodeAudioData(data.slice(0));
        this.bufferCache.set(k, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.decodePromises.delete(k);
      }
    })();
    this.decodePromises.set(k, task);
    return task;
  }

  /** Simple peak array for waveform preview (0..1), from cached buffer. */
  getPeaks(cue: FoleyCue, bars = 48): number[] {
    const buf = this.bufferCache.get(this.key(cue));
    if (!buf) return [];
    const ch = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / bars));
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * step;
      for (let j = start; j < Math.min(start + step, ch.length); j += 16) {
        const a = Math.abs(ch[j]);
        if (a > max) max = a;
      }
      out.push(Math.min(1, max));
    }
    return out;
  }

  private scheduleOne(
    cue: FoleyCue,
    buf: AudioBuffer,
    startWhen: number,
    offset: number,
    duration: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = cue.isMuted ? 0 : cue.volume;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, cue.pan));
    src.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    this.activeSources.add(src);
    this.activeGains.add(gain);
    src.onended = () => {
      this.activeSources.delete(src);
      this.activeGains.delete(gain);
      try {
        src.disconnect();
        gain.disconnect();
        pan.disconnect();
      } catch {
        /* noop */
      }
    };
    try {
      src.start(startWhen, Math.min(offset, buf.duration), duration);
    } catch {
      /* buffer already ended */
    }
  }

  /**
   * Schedule upcoming cues starting at videoTime.
   * Cues already finished are skipped; cues mid-play are started at offset.
   */
  async syncPlay(cues: FoleyCue[], videoTime: number): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.stopAll();
    const now = ctx.currentTime + 0.06; // small lookahead for scheduling latency
    for (const cue of cues) {
      if (cue.isMuted) continue;
      const cueStart = cue.timestamp;
      const cueEnd = cue.timestamp + cue.duration;
      if (cueEnd <= videoTime) continue;
      const buf = await this.getBuffer(cue);
      if (!buf) continue;
      const delay = Math.max(0, cueStart - videoTime);
      const offset = Math.max(0, videoTime - cueStart);
      const remaining = cueEnd - videoTime;
      const playDur = Math.min(remaining, buf.duration - offset);
      if (playDur <= 0) continue;
      this.scheduleOne(cue, buf, now + delay, offset, playDur);
    }
  }

  /** Play a single cue immediately (used for preview / regenerate audition). */
  async preview(cue: FoleyCue): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const buf = await this.getBuffer(cue);
    if (!buf) return;
    if (cue.isMuted) return;
    this.scheduleOne(cue, buf, ctx.currentTime + 0.02, 0, buf.duration);
  }

  stopAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of this.activeGains) {
      try {
        // 5ms linear ramp to silence -> no clicks.
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.005);
      } catch {
        /* noop */
      }
    }
    const sources = [...this.activeSources];
    // Stop after the ramp.
    for (const s of sources) {
      try {
        s.stop(t + 0.006);
      } catch {
        /* already stopped */
      }
    }
    this.activeSources.clear();
    this.activeGains.clear();
  }

  clearCacheFor(cueId: string) {
    for (const k of [...this.bufferCache.keys()]) {
      if (k.startsWith(`${cueId}::`)) this.bufferCache.delete(k);
    }
  }
}

export const audioEngine = new AudioEngineImpl();
