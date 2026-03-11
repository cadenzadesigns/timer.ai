import type { AudioEvent } from '@timer-ai/core';

let ctx: AudioContext | null = null;

export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
  }
  // Browsers require a user gesture before resuming AudioContext
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
  if (!ctx) return;

  switch (event) {
    case 'beep':
      tone(880, 0.12, 'square', 0.3);
      break;

    case 'countdown-3':
      tone(440, 0.18, 'sine', 0.25);
      break;

    case 'countdown-2':
      tone(440, 0.18, 'sine', 0.25);
      break;

    case 'countdown-1':
      tone(660, 0.25, 'sine', 0.3);
      break;

    case 'round-complete':
      // Two quick tones: medium + high
      tone(660, 0.15, 'square', 0.3, 0);
      tone(880, 0.2, 'square', 0.3, 0.18);
      break;

    case 'workout-complete':
      // Triumphant chord: C5-E5-G5
      tone(523, 0.5, 'sine', 0.3, 0);
      tone(659, 0.5, 'sine', 0.25, 0.05);
      tone(784, 0.7, 'sine', 0.25, 0.1);
      tone(1047, 0.9, 'sine', 0.2, 0.2);
      break;
  }
}
