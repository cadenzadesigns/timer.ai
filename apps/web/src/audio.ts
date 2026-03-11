import type { AudioEvent } from '@timer-ai/core';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
  }
  // Browsers require a user gesture before resuming AudioContext
  // This handles mobile Safari's suspended state
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.35,
  delay = 0,
): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.connect(vol);
  vol.connect(ctx.destination);

  osc.type = type;
  osc.frequency.value = frequency;

  const start = ctx.currentTime + delay;
  vol.gain.setValueAtTime(0, start);
  vol.gain.linearRampToValueAtTime(gain, start + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.001, start + duration);

  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export function playAudioEvent(event: AudioEvent): void {
  if (!ctx || muted) return;

  switch (event) {
    case 'work-start':
      // Aggressive: double punch of square waves — starting gun feel
      tone(880, 0.07, 'square', 0.5, 0);
      tone(1108, 0.10, 'square', 0.35, 0.06);
      tone(880, 0.14, 'square', 0.2, 0.14);
      break;

    case 'rest-start':
      // Calm: descending soft tones — signal to breathe
      tone(660, 0.25, 'sine', 0.3, 0);
      tone(440, 0.45, 'sine', 0.2, 0.15);
      break;

    case 'countdown-3':
      // Low, measured pulse
      tone(330, 0.22, 'sine', 0.28);
      break;

    case 'countdown-2':
      // Mid tone
      tone(440, 0.22, 'sine', 0.28);
      break;

    case 'countdown-1':
      // High anticipation tone — longer to build tension
      tone(550, 0.32, 'sine', 0.32);
      break;

    case 'workout-complete':
      // Triumphant ascending chord: C5–E5–G5–C6
      tone(523, 0.55, 'sine', 0.3, 0);
      tone(659, 0.55, 'sine', 0.25, 0.08);
      tone(784, 0.75, 'sine', 0.25, 0.16);
      tone(1047, 1.0, 'sine', 0.22, 0.28);
      break;
  }
}
