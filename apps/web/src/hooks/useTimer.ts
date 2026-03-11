import { useState, useRef, useCallback, useEffect } from 'react';
import { timerReducer, initialTimerState } from '@timer-ai/core';
import type { TimerState, TimerConfig } from '@timer-ai/core';
import { initAudio, playAudioEvent } from '../audio';

export function useTimer(config: TimerConfig) {
  const [state, setState] = useState<TimerState>({
    ...initialTimerState,
    config,
  });

  // Keep a ref for synchronous access in the interval callback
  const stateRef = useRef<TimerState>({ ...initialTimerState, config });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep state ref in sync
  const syncState = useCallback((next: TimerState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const dispatch = useCallback(
    (action: Parameters<typeof timerReducer>[1]) => {
      const result = timerReducer(stateRef.current, action);
      syncState(result.state);
      result.audioEvents.forEach(playAudioEvent);
      return result;
    },
    [syncState],
  );

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const result = timerReducer(stateRef.current, { type: 'TICK' });
      stateRef.current = result.state;
      setState(result.state);
      result.audioEvents.forEach(playAudioEvent);

      // Auto-stop interval when workout completes
      if (result.state.phase === 'COMPLETE') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 1000);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    initAudio();
    const result = timerReducer(stateRef.current, { type: 'START' });
    stateRef.current = result.state;
    setState(result.state);
    result.audioEvents.forEach(playAudioEvent);
    startInterval();
  }, [startInterval]);

  const pause = useCallback(() => {
    stopInterval();
    dispatch({ type: 'PAUSE' });
  }, [stopInterval, dispatch]);

  const resume = useCallback(() => {
    dispatch({ type: 'RESUME' });
    startInterval();
  }, [dispatch, startInterval]);

  const reset = useCallback(() => {
    stopInterval();
    dispatch({ type: 'RESET' });
  }, [stopInterval, dispatch]);

  // Update config when it changes
  useEffect(() => {
    stopInterval();
    const next = { ...initialTimerState, config };
    stateRef.current = next;
    setState(next);
  }, [config, stopInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  return { state, start, pause, resume, reset };
}
