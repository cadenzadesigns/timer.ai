import { useEffect, useRef, useState } from 'react';
import { makeTimerConfig } from '@timer-ai/core';
import type { TimerPhase } from '@timer-ai/core';
import { useTimer } from './hooks/useTimer';

// Hardcoded Tabata config for Phase 1
const TABATA = makeTimerConfig(20, 10, 8, 1, 0, '3-2-1');

// SVG ring geometry
const RADIUS = 148;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const VIEWBOX = RADIUS * 2 + STROKE * 2;
const CENTER = RADIUS + STROKE;

// Phase metadata
const PHASE_META: Record<
  TimerPhase,
  { label: string; color: string; bg: string; glow: string }
> = {
  IDLE:             { label: 'READY',      color: '#4a4a5a', bg: '#0d0d14', glow: 'rgba(74,74,90,0)' },
  COUNTDOWN:        { label: 'GET SET',    color: '#FFD600', bg: '#0d0d08', glow: 'rgba(255,214,0,0.15)' },
  WORK:             { label: 'WORK',       color: '#FF3300', bg: '#110808', glow: 'rgba(255,51,0,0.18)' },
  REST:             { label: 'REST',       color: '#00CCFF', bg: '#08100d', glow: 'rgba(0,204,255,0.15)' },
  REST_BETWEEN_SETS:{ label: 'SET REST',   color: '#00CCFF', bg: '#08100d', glow: 'rgba(0,204,255,0.12)' },
  COMPLETE:         { label: 'DONE',       color: '#00FF88', bg: '#080d0a', glow: 'rgba(0,255,136,0.2)' },
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getPhaseDuration(phase: TimerPhase, config: typeof TABATA): number {
  switch (phase) {
    case 'COUNTDOWN': return 3;
    case 'WORK': return config.work;
    case 'REST': return config.rest;
    case 'REST_BETWEEN_SETS': return config.restBetweenSets;
    default: return 0;
  }
}

export default function App() {
  const { state, start, pause, resume, reset } = useTimer(TABATA);
  const { phase, secondsLeft, currentRound, currentSet, totalElapsed, paused, config } = state;
  const meta = PHASE_META[phase];

  // Track previous phase for flash animation
  const prevPhaseRef = useRef<TimerPhase>(phase);
  const [flashing, setFlashing] = useState(false);
  const [tickPulse, setTickPulse] = useState(false);

  // Phase change → flash
  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      prevPhaseRef.current = phase;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 450);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Tick → pulse the number
  const prevSecondsRef = useRef(secondsLeft);
  useEffect(() => {
    if (prevSecondsRef.current !== secondsLeft && phase !== 'IDLE') {
      prevSecondsRef.current = secondsLeft;
      setTickPulse(true);
      const t = setTimeout(() => setTickPulse(false), 120);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, phase]);

  // Ring progress
  const phaseDuration = config ? getPhaseDuration(phase, config) : 0;
  const progress = phaseDuration > 0 ? secondsLeft / phaseDuration : 1;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const isActive = phase !== 'IDLE' && phase !== 'COMPLETE' && !paused;
  const isRunning = isActive;
  const isPaused = paused && phase !== 'IDLE' && phase !== 'COMPLETE';
  const isComplete = phase === 'COMPLETE';
  const isIdle = phase === 'IDLE';

  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden select-none"
      style={{ background: meta.bg, transition: 'background 0.6s ease' }}
    >
      {/* Scanlines overlay */}
      <div className="scanlines" />

      {/* Phase flash overlay */}
      {flashing && (
        <div
          className="phase-flash"
          style={{ background: meta.color }}
        />
      )}

      {/* Radial glow behind the ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '520px',
          height: '520px',
          background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)`,
          transition: 'background 0.5s ease',
        }}
      />

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 flex justify-center">
        <span className="font-label text-xs tracking-[0.4em] uppercase" style={{ color: '#333344' }}>
          timer.ai
        </span>
      </div>

      {/* Phase label */}
      <div
        className="font-label text-sm tracking-[0.35em] mb-6 transition-all duration-300"
        style={{
          color: meta.color,
          textShadow: `0 0 20px ${meta.color}88`,
        }}
      >
        {meta.label}
      </div>

      {/* Main ring */}
      <div className="relative flex items-center justify-center">
        <svg
          width={VIEWBOX}
          height={VIEWBOX}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track ring */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#1a1a22"
            strokeWidth={STROKE}
          />
          {/* Progress ring */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={meta.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transition: phase !== 'IDLE' ? 'stroke-dashoffset 0.95s linear, stroke 0.4s ease' : 'none',
              filter: `drop-shadow(0 0 8px ${meta.color}99)`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Big timer number */}
          <div
            className="font-display leading-none"
            style={{
              fontSize: '104px',
              color: '#ffffff',
              transform: tickPulse ? 'scale(1.025)' : 'scale(1)',
              transition: 'transform 0.1s ease-out',
              textShadow: phase !== 'IDLE' ? `0 0 30px ${meta.color}55` : 'none',
            }}
          >
            {phase === 'IDLE' ? '--' : phase === 'COMPLETE' ? '✓' : secondsLeft}
          </div>

          {/* Round/Set inside ring */}
          {!isIdle && !isComplete && (
            <div className="font-mono text-xs mt-1" style={{ color: '#555566' }}>
              R{currentRound}/{config?.rounds} · S{currentSet}/{config?.sets}
            </div>
          )}
        </div>
      </div>

      {/* Elapsed time */}
      <div className="font-mono text-xs mt-6 tracking-widest" style={{ color: '#33333f' }}>
        {isIdle ? formatElapsed(0) : formatElapsed(totalElapsed)}
      </div>

      {/* Config summary */}
      {isIdle && (
        <div className="font-mono text-xs mt-2 tracking-wider" style={{ color: '#2a2a36' }}>
          {config?.work}s WORK · {config?.rest}s REST · {config?.rounds} ROUNDS
        </div>
      )}

      {/* Workout complete message */}
      {isComplete && (
        <div
          className="font-label text-xs tracking-[0.3em] mt-4"
          style={{ color: meta.color, textShadow: `0 0 16px ${meta.color}88` }}
        >
          WORKOUT COMPLETE
        </div>
      )}

      {/* Control buttons */}
      <div className="flex gap-4 mt-10">
        {isIdle && (
          <button onClick={start} className="btn-primary" style={{ '--btn-color': meta.color } as React.CSSProperties}>
            START
          </button>
        )}

        {isRunning && (
          <button onClick={pause} className="btn-secondary">
            PAUSE
          </button>
        )}

        {isPaused && (
          <button onClick={resume} className="btn-primary" style={{ '--btn-color': meta.color } as React.CSSProperties}>
            RESUME
          </button>
        )}

        {(isPaused || isComplete || (!isIdle && !isRunning)) && (
          <button onClick={reset} className="btn-ghost">
            RESET
          </button>
        )}

        {isRunning && (
          <button onClick={reset} className="btn-ghost">
            RESET
          </button>
        )}
      </div>

      {/* Corner decorations */}
      <div className="corner-tl" />
      <div className="corner-tr" />
      <div className="corner-bl" />
      <div className="corner-br" />
    </div>
  );
}
