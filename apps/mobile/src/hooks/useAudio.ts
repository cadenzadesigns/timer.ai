import { useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import type { AudioEvent } from '@timer-ai/core';

/**
 * Audio hook for the timer.
 *
 * Uses haptic feedback as the primary tactile cue (works out of the box in Expo Go).
 * Sound playback via expo-av requires bundled audio assets — see TODO below.
 *
 * TODO: Bundle beep WAV/MP3 files in assets/audio/ and load them here:
 *   const workStartSound = await Audio.Sound.createAsync(require('../../assets/audio/work-start.mp3'));
 */
export function useAudio() {
  const mutedRef = useRef(false);

  const play = useCallback(async (event: AudioEvent) => {
    if (mutedRef.current) return;

    // Haptic feedback — immediate tactile cue that works in Expo Go
    try {
      switch (event) {
        case 'work-start':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'rest-start':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'countdown-1':
        case 'countdown-2':
        case 'countdown-3':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'workout-complete':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Double buzz for completion
          setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 200);
          break;
      }
    } catch {
      // Haptics may not be supported on all devices/simulators — fail silently
    }
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
  }, []);

  return { play, setMuted };
}
