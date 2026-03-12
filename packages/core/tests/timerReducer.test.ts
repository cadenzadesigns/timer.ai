import { describe, it, expect } from 'bun:test';
import { timerReducer, initialTimerState } from '../src/timerReducer';
import { makeTimerConfig } from '../src/types';
import type { TimerState, AudioEvent } from '../src/types';

// Tick the timer n times and collect all audio events
function tickN(state: TimerState, n: number): { state: TimerState; events: AudioEvent[] } {
  let current = state;
  const events: AudioEvent[] = [];
  for (let i = 0; i < n; i++) {
    const result = timerReducer(current, { type: 'TICK' });
    current = result.state;
    events.push(...result.audioEvents);
  }
  return { state: current, events };
}

describe('timerReducer', () => {
  describe('CONFIGURE', () => {
    it('stores config and resets to IDLE', () => {
      const config = makeTimerConfig(20, 10, 8, 1);
      const result = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      expect(result.state.phase).toBe('IDLE');
      expect(result.state.config).toEqual(config);
      expect(result.audioEvents).toHaveLength(0);
    });
  });

  describe('3-2-1 countdown tones', () => {
    it('goes straight to WORK on START and plays countdown tones in last 3 seconds', () => {
      const config = makeTimerConfig(5, 10, 2, 1, 0, '3-2-1');
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });

      // START goes straight to WORK
      expect(started.state.phase).toBe('WORK');
      expect(started.state.secondsLeft).toBe(5);
      expect(started.audioEvents).toContain('work-start');

      // Tick 5→4: no countdown yet
      const tick1 = timerReducer(started.state, { type: 'TICK' });
      expect(tick1.state.secondsLeft).toBe(4);

      // Tick 4→3: countdown-3
      const tick2 = timerReducer(tick1.state, { type: 'TICK' });
      expect(tick2.state.secondsLeft).toBe(3);
      expect(tick2.audioEvents).toContain('countdown-3');

      // Tick 3→2: countdown-2
      const tick3 = timerReducer(tick2.state, { type: 'TICK' });
      expect(tick3.state.secondsLeft).toBe(2);
      expect(tick3.audioEvents).toContain('countdown-2');

      // Tick 2→1: countdown-1
      const tick4 = timerReducer(tick3.state, { type: 'TICK' });
      expect(tick4.state.secondsLeft).toBe(1);
      expect(tick4.audioEvents).toContain('countdown-1');
    });

    it('enters WORK directly on single buzzer START', () => {
      const config = makeTimerConfig(20, 10, 2, 1, 0, 'single');
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });

      expect(started.state.phase).toBe('WORK');
      expect(started.audioEvents).toContain('work-start');
    });
  });

  describe('full Tabata cycle (20/10 × 8 rounds × 1 set)', () => {
    it('completes all rounds and emits workout-complete', () => {
      const config = makeTimerConfig(20, 10, 8, 1, 0, 'single');
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });

      // Should be in WORK, round 1
      expect(started.state.phase).toBe('WORK');
      expect(started.state.currentRound).toBe(1);

      let state = started.state;

      for (let round = 1; round <= 8; round++) {
        // Tick through WORK (20 ticks, last tick triggers transition)
        const afterWork = tickN(state, 20);
        expect(afterWork.state.phase).toBe('REST');
        expect(afterWork.state.currentRound).toBe(round);
        expect(afterWork.events).toContain('rest-start');

        state = afterWork.state;

        // Tick through REST (10 ticks)
        const afterRest = tickN(state, 10);
        state = afterRest.state;

        if (round < 8) {
          expect(state.phase).toBe('WORK');
          expect(state.currentRound).toBe(round + 1);
          expect(afterRest.events).toContain('work-start');
        } else {
          expect(state.phase).toBe('COMPLETE');
          expect(afterRest.events).toContain('workout-complete');
        }
      }

      expect(state.phase).toBe('COMPLETE');
      expect(state.totalElapsed).toBe(240); // (20+10)*8 = 240s
    });
  });

  describe('multi-set with rest between sets (20/10 × 4 rounds × 2 sets, 30s rest)', () => {
    it('transitions through sets with REST_BETWEEN_SETS', () => {
      const config = makeTimerConfig(20, 10, 4, 2, 30, 'single');
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });

      let state = started.state;
      expect(state.phase).toBe('WORK');
      expect(state.currentSet).toBe(1);

      // Complete all 4 rounds of set 1 (20+10)*4 = 120 ticks
      const afterSet1 = tickN(state, 120);
      expect(afterSet1.state.phase).toBe('REST_BETWEEN_SETS');
      expect(afterSet1.state.secondsLeft).toBe(30);
      expect(afterSet1.state.currentSet).toBe(1);

      state = afterSet1.state;

      // Tick through REST_BETWEEN_SETS (30 ticks)
      const afterSetRest = tickN(state, 30);
      expect(afterSetRest.state.phase).toBe('WORK');
      expect(afterSetRest.state.currentSet).toBe(2);
      expect(afterSetRest.state.currentRound).toBe(1);
      expect(afterSetRest.events).toContain('work-start');

      state = afterSetRest.state;

      // Complete all 4 rounds of set 2
      const afterSet2 = tickN(state, 120);
      expect(afterSet2.state.phase).toBe('COMPLETE');
      expect(afterSet2.events).toContain('workout-complete');
    });

    it('computes totalElapsed correctly', () => {
      const config = makeTimerConfig(20, 10, 4, 2, 30, 'single');
      // total = (20+10)*4*2 + 30*(2-1) = 240 + 30 = 270
      expect(config.totalSeconds).toBe(270);

      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });
      let state = started.state;
      const total = tickN(state, 270);
      expect(total.state.phase).toBe('COMPLETE');
      expect(total.state.totalElapsed).toBe(270);
    });
  });

  describe('pause / resume', () => {
    it('stops ticking when paused, resumes on RESUME', () => {
      const config = makeTimerConfig(20, 10, 2, 1, 0, 'single');
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });

      // Tick 5 times
      const { state: after5 } = tickN(started.state, 5);
      expect(after5.secondsLeft).toBe(15);

      // Pause
      const paused = timerReducer(after5, { type: 'PAUSE' });
      expect(paused.state.paused).toBe(true);

      // Tick 5 more — should be no-op
      const { state: stillPaused } = tickN(paused.state, 5);
      expect(stillPaused.secondsLeft).toBe(15);
      expect(stillPaused.paused).toBe(true);

      // Resume
      const resumed = timerReducer(stillPaused, { type: 'RESUME' });
      expect(resumed.state.paused).toBe(false);

      // Tick 5 more — should decrement
      const { state: after5more } = tickN(resumed.state, 5);
      expect(after5more.secondsLeft).toBe(10);
    });
  });

  describe('RESET', () => {
    it('returns to IDLE keeping config', () => {
      const config = makeTimerConfig(20, 10, 8, 1);
      const configured = timerReducer(initialTimerState, { type: 'CONFIGURE', config });
      const started = timerReducer(configured.state, { type: 'START' });
      const { state: midway } = tickN(started.state, 10);

      const reset = timerReducer(midway, { type: 'RESET' });
      expect(reset.state.phase).toBe('IDLE');
      expect(reset.state.config).toEqual(config);
      expect(reset.state.secondsLeft).toBe(0);
      expect(reset.state.totalElapsed).toBe(0);
    });
  });
});
