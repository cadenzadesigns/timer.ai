import { useState, useRef, useCallback, useEffect } from 'react';
import { timerReducer, initialTimerState } from '@timer-ai/core';
import type { TimerState, TimerConfig } from '@timer-ai/core';
import type { useAudio } from './useAudio';

type AudioHook = ReturnType<typeof useAudio>;

export function useTimer(config: TimerConfig, audio: AudioHook) {
  const [state, setState] = useState<TimerState>({ ...initialTimerState, config });
  const stateRef = useRef<TimerState>({ ...initialTimerState, config });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncState = useCallback((next: TimerState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const dispatch = useCallback(
    (action: Parameters<typeof timerReducer>[1]) => {
      const result = timerReducer(stateRef.current, action);
      syncState(result.state);
      result.audioEvents.forEach(e => audio.play(e));
      return result;
    },
    [syncState, audio],
  );

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const result = timerReducer(stateRef.current, { type: 'TICK' });
      stateRef.current = result.state;
      setState(result.state);
      result.audioEvents.forEach(e => audio.play(e));
      if (result.state.phase === 'COMPLETE') {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      }
    }, 1000);
  }, [audio]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    const result = timerReducer(stateRef.current, { type: 'START' });
    stateRef.current = result.state;
    setState(result.state);
    result.audioEvents.forEach(e => audio.play(e));
    startInterval();
  }, [startInterval, audio]);

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

  useEffect(() => () => stopInterval(), [stopInterval]);

  return { state, start, pause, resume, reset };
}
