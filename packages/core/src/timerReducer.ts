import type {
  TimerState,
  TimerAction,
  TickResult,
  AudioEvent,
  TimerConfig,
} from './types.js';

export const initialTimerState: TimerState = {
  phase: 'IDLE',
  secondsLeft: 0,
  currentRound: 1,
  currentSet: 1,
  totalElapsed: 0,
  config: null,
  paused: false,
};

function noop(state: TimerState): TickResult {
  return { state, audioEvents: [] };
}

function transitionFromCountdown(state: TimerState, newElapsed: number): TickResult {
  const config = state.config!;
  return {
    state: {
      ...state,
      phase: 'WORK',
      secondsLeft: config.work,
      totalElapsed: newElapsed,
    },
    audioEvents: ['work-start'],
  };
}

function transitionFromWork(state: TimerState, newElapsed: number): TickResult {
  const config = state.config!;
  const isLastRound = state.currentRound >= config.rounds;
  const isLastSet = state.currentSet >= config.sets;

  // If last round of last set and no rest, go straight to complete
  if (isLastRound && isLastSet && config.rest === 0) {
    return {
      state: {
        ...state,
        phase: 'COMPLETE',
        secondsLeft: 0,
        totalElapsed: newElapsed,
      },
      audioEvents: ['workout-complete'],
    };
  }

  // If no rest period, skip REST and go to next round/set (with countdown if enabled)
  if (config.rest === 0) {
    if (isLastRound) {
      // Last round, not last set — rest between sets or next set
      if (config.restBetweenSets > 0) {
        return {
          state: {
            ...state,
            phase: 'REST_BETWEEN_SETS',
            secondsLeft: config.restBetweenSets,
            totalElapsed: newElapsed,
          },
          audioEvents: ['rest-start'],
        };
      }
      return transitionToWork(state, newElapsed, 1, state.currentSet + 1);
    }
    return transitionToWork(state, newElapsed, state.currentRound + 1, state.currentSet);
  }

  // Normal: transition to REST
  return {
    state: {
      ...state,
      phase: 'REST',
      secondsLeft: config.rest,
      totalElapsed: newElapsed,
    },
    audioEvents: ['rest-start'],
  };
}

/** Helper: transition to WORK phase, inserting COUNTDOWN if config says 3-2-1 */
function transitionToWork(state: TimerState, newElapsed: number, round: number, set: number): TickResult {
  const config = state.config!;
  if (config.countdown === '3-2-1') {
    return {
      state: {
        ...state,
        phase: 'COUNTDOWN',
        secondsLeft: 3,
        currentRound: round,
        currentSet: set,
        totalElapsed: newElapsed,
      },
      audioEvents: ['countdown-3'],
    };
  }
  return {
    state: {
      ...state,
      phase: 'WORK',
      secondsLeft: config.work,
      currentRound: round,
      currentSet: set,
      totalElapsed: newElapsed,
    },
    audioEvents: ['work-start'],
  };
}

function transitionFromRest(state: TimerState, newElapsed: number): TickResult {
  const config = state.config!;
  const isLastRound = state.currentRound >= config.rounds;
  const isLastSet = state.currentSet >= config.sets;

  if (isLastRound && isLastSet) {
    return {
      state: {
        ...state,
        phase: 'COMPLETE',
        secondsLeft: 0,
        totalElapsed: newElapsed,
      },
      audioEvents: ['workout-complete'],
    };
  }

  if (isLastRound) {
    if (config.restBetweenSets > 0) {
      return {
        state: {
          ...state,
          phase: 'REST_BETWEEN_SETS',
          secondsLeft: config.restBetweenSets,
          totalElapsed: newElapsed,
        },
        audioEvents: ['rest-start'],
      };
    }
    return transitionToWork(state, newElapsed, 1, state.currentSet + 1);
  }

  // Normal round transition
  return transitionToWork(state, newElapsed, state.currentRound + 1, state.currentSet);
}

function transitionFromRestBetweenSets(state: TimerState, newElapsed: number): TickResult {
  return transitionToWork(state, newElapsed, 1, state.currentSet + 1);
}

function handleTick(state: TimerState): TickResult {
  if (state.paused || state.phase === 'IDLE' || state.phase === 'COMPLETE') {
    return noop(state);
  }

  const newElapsed = state.totalElapsed + 1;

  // Not at transition point yet — just decrement
  if (state.secondsLeft > 1) {
    const newSecondsLeft = state.secondsLeft - 1;
    const audioEvents: AudioEvent[] = [];

    // Emit countdown audio based on the new value we're showing
    if (state.phase === 'COUNTDOWN') {
      if (newSecondsLeft === 2) audioEvents.push('countdown-2');
      else if (newSecondsLeft === 1) audioEvents.push('countdown-1');
    }

    // 3-2-1 countdown during last 3 seconds of WORK (when countdown mode is 3-2-1)
    if (state.phase === 'WORK' && state.config?.countdown === '3-2-1') {
      if (newSecondsLeft === 3) audioEvents.push('countdown-3');
      else if (newSecondsLeft === 2) audioEvents.push('countdown-2');
      else if (newSecondsLeft === 1) audioEvents.push('countdown-1');
    }

    return {
      state: { ...state, secondsLeft: newSecondsLeft, totalElapsed: newElapsed },
      audioEvents,
    };
  }

  // secondsLeft === 1 — transition to next phase
  switch (state.phase) {
    case 'COUNTDOWN':
      return transitionFromCountdown(state, newElapsed);
    case 'WORK':
      return transitionFromWork(state, newElapsed);
    case 'REST':
      return transitionFromRest(state, newElapsed);
    case 'REST_BETWEEN_SETS':
      return transitionFromRestBetweenSets(state, newElapsed);
    default:
      return noop(state);
  }
}

export function timerReducer(state: TimerState, action: TimerAction): TickResult {
  switch (action.type) {
    case 'CONFIGURE': {
      return {
        state: {
          ...initialTimerState,
          config: action.config,
        },
        audioEvents: [],
      };
    }

    case 'START': {
      if (!state.config) return noop(state);
      if (state.config.countdown === '3-2-1') {
        return {
          state: {
            ...state,
            phase: 'COUNTDOWN',
            secondsLeft: 3,
            currentRound: 1,
            currentSet: 1,
            totalElapsed: 0,
            paused: false,
          },
          audioEvents: ['countdown-3'],
        };
      }
      return {
        state: {
          ...state,
          phase: 'WORK',
          secondsLeft: state.config.work,
          currentRound: 1,
          currentSet: 1,
          totalElapsed: 0,
          paused: false,
        },
        audioEvents: ['work-start'],
      };
    }

    case 'TICK':
      return handleTick(state);

    case 'PAUSE': {
      if (state.phase === 'IDLE' || state.phase === 'COMPLETE') return noop(state);
      return { state: { ...state, paused: true }, audioEvents: [] };
    }

    case 'RESUME': {
      return { state: { ...state, paused: false }, audioEvents: [] };
    }

    case 'RESET': {
      return {
        state: {
          ...initialTimerState,
          config: state.config,
        },
        audioEvents: [],
      };
    }

    default:
      return noop(state);
  }
}
