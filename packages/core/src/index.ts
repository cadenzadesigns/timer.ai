export type {
  TimerConfig,
  TimerPhase,
  TimerState,
  TimerAction,
  AudioEvent,
  TickResult,
} from './types.js';

export { makeTimerConfig } from './types.js';
export { timerReducer, initialTimerState } from './timerReducer.js';
