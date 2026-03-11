export interface TimerConfig {
  work: number;           // seconds
  rest: number;           // seconds
  rounds: number;
  sets: number;
  restBetweenSets: number; // seconds, default 0
  countdown: '3-2-1' | 'single';
  totalSeconds: number;   // derived: (work + rest) * rounds * sets + restBetweenSets * (sets - 1). -1 if infinite.
  infinite: boolean;      // loop forever until manually stopped
}

export type TimerPhase =
  | 'IDLE'
  | 'COUNTDOWN'
  | 'WORK'
  | 'REST'
  | 'REST_BETWEEN_SETS'
  | 'COMPLETE';

export interface TimerState {
  phase: TimerPhase;
  secondsLeft: number;
  currentRound: number;
  currentSet: number;
  totalElapsed: number;
  config: TimerConfig | null;
  paused: boolean;
}

export type TimerAction =
  | { type: 'CONFIGURE'; config: TimerConfig }
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESET' };

export type AudioEvent =
  | 'work-start'
  | 'rest-start'
  | 'countdown-3'
  | 'countdown-2'
  | 'countdown-1'
  | 'workout-complete';

export interface TickResult {
  state: TimerState;
  audioEvents: AudioEvent[];
}

export function makeTimerConfig(
  work: number,
  rest: number,
  rounds: number,
  sets: number,
  restBetweenSets = 0,
  countdown: '3-2-1' | 'single' = '3-2-1',
  infinite = false
): TimerConfig {
  return {
    work,
    rest,
    rounds,
    sets,
    restBetweenSets,
    countdown,
    infinite,
    totalSeconds: infinite ? -1 : (work + rest) * rounds * sets + restBetweenSets * (sets - 1),
  };
}
