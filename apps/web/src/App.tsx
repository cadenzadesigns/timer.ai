import { useEffect, useRef, useState, useCallback } from 'react';
import { makeTimerConfig } from '@timer-ai/core';
import type { TimerConfig, TimerPhase } from '@timer-ai/core';
import { useTimer } from './hooks/useTimer';
import { useWakeLock } from './hooks/useWakeLock';
import { NLInput } from './components/NLInput';
import { PresetList } from './components/PresetList';

interface AppProps {
  convexEnabled?: boolean;
}

const DEFAULT_CONFIG = makeTimerConfig(20, 10, 8, 1, 0, '3-2-1');

// SVG ring geometry (desktop; scales via CSS on mobile)
const RADIUS = 130;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const VIEWBOX = RADIUS * 2 + STROKE * 2;
const CENTER = RADIUS + STROKE;

const PHASE_META: Record<TimerPhase, { label: string; color: string; bg: string; glow: string }> = {
  IDLE:             { label: 'READY',    color: '#4a4a5a', bg: '#08080e', glow: 'rgba(74,74,90,0)' },
  COUNTDOWN:        { label: 'GET SET',  color: '#FFD600', bg: '#0c0b05', glow: 'rgba(255,214,0,0.15)' },
  WORK:             { label: 'WORK',     color: '#FF3300', bg: '#0f0707', glow: 'rgba(255,51,0,0.2)' },
  REST:             { label: 'REST',     color: '#00CCFF', bg: '#07100e', glow: 'rgba(0,204,255,0.15)' },
  REST_BETWEEN_SETS:{ label: 'SET REST', color: '#00CCFF', bg: '#07100e', glow: 'rgba(0,204,255,0.12)' },
  COMPLETE:         { label: 'DONE',     color: '#00FF88', bg: '#07100a', glow: 'rgba(0,255,136,0.2)' },
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getPhaseDuration(phase: TimerPhase, config: TimerConfig): number {
  switch (phase) {
    case 'COUNTDOWN': return 3;
    case 'WORK': return config.work;
    case 'REST': return config.rest;
    case 'REST_BETWEEN_SETS': return config.restBetweenSets;
    default: return 0;
  }
}

function formatTotal(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec > 0 ? sec + 's' : ''}`.trim() : `${sec}s`;
}

// Manual config editor (when Convex not available)
function ManualConfig({ config, onChange }: { config: TimerConfig; onChange: (c: TimerConfig) => void }) {
  const [work, setWork] = useState(config.work);
  const [rest, setRest] = useState(config.rest);
  const [rounds, setRounds] = useState(config.rounds);
  const [sets, setSets] = useState(config.sets);
  const [restBetweenSets, setRestBetweenSets] = useState(config.restBetweenSets);
  const [countdown, setCountdown] = useState<'3-2-1' | 'single'>(config.countdown);

  function apply() {
    onChange(makeTimerConfig(work, rest, rounds, sets, restBetweenSets, countdown));
  }

  return (
    <div className="manual-config">
      <div className="manual-config-grid">
        <label className="mc-field">
          <span className="mc-label">WORK</span>
          <div className="mc-input-wrap">
            <input className="mc-input" type="number" min={5} max={3600} value={work}
              onChange={e => setWork(Number(e.target.value))} />
            <span className="mc-unit">s</span>
          </div>
        </label>
        <label className="mc-field">
          <span className="mc-label">REST</span>
          <div className="mc-input-wrap">
            <input className="mc-input" type="number" min={0} max={3600} value={rest}
              onChange={e => setRest(Number(e.target.value))} />
            <span className="mc-unit">s</span>
          </div>
        </label>
        <label className="mc-field">
          <span className="mc-label">ROUNDS</span>
          <div className="mc-input-wrap">
            <input className="mc-input" type="number" min={1} max={100} value={rounds}
              onChange={e => setRounds(Number(e.target.value))} />
          </div>
        </label>
        <label className="mc-field">
          <span className="mc-label">SETS</span>
          <div className="mc-input-wrap">
            <input className="mc-input" type="number" min={1} max={20} value={sets}
              onChange={e => setSets(Number(e.target.value))} />
          </div>
        </label>
        {sets > 1 && (
          <label className="mc-field">
            <span className="mc-label">SET REST</span>
            <div className="mc-input-wrap">
              <input className="mc-input" type="number" min={0} max={600} value={restBetweenSets}
                onChange={e => setRestBetweenSets(Number(e.target.value))} />
              <span className="mc-unit">s</span>
            </div>
          </label>
        )}
        <label className="mc-field">
          <span className="mc-label">START</span>
          <select className="mc-select" value={countdown}
            onChange={e => setCountdown(e.target.value as '3-2-1' | 'single')}>
            <option value="3-2-1">3-2-1</option>
            <option value="single">SINGLE</option>
          </select>
        </label>
      </div>
      <button className="btn-ghost mc-apply" onClick={apply}>
        APPLY CONFIG
      </button>
    </div>
  );
}

export default function App({ convexEnabled = false }: AppProps) {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [lastDescription, setLastDescription] = useState<string>('');
  const { state, start, pause, resume, reset } = useTimer(config);
  const { phase, secondsLeft, currentRound, currentSet, totalElapsed, paused } = state;
  const meta = PHASE_META[phase];

  const isActive = phase !== 'IDLE' && phase !== 'COMPLETE' && !paused;
  const isRunning = isActive;
  const isPaused = paused && phase !== 'IDLE' && phase !== 'COMPLETE';
  const isComplete = phase === 'COMPLETE';
  const isIdle = phase === 'IDLE';

  // Wake lock during active workout
  useWakeLock(isRunning);

  // Phase flash
  const prevPhaseRef = useRef<TimerPhase>(phase);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      prevPhaseRef.current = phase;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 450);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Tick pulse
  const prevSecondsRef = useRef(secondsLeft);
  const [tickPulse, setTickPulse] = useState(false);
  useEffect(() => {
    if (prevSecondsRef.current !== secondsLeft && phase !== 'IDLE') {
      prevSecondsRef.current = secondsLeft;
      setTickPulse(true);
      const t = setTimeout(() => setTickPulse(false), 120);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, phase]);

  // Ring progress
  const phaseDuration = getPhaseDuration(phase, config);
  const progress = phaseDuration > 0 ? secondsLeft / phaseDuration : 1;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const handleConfig = useCallback((c: TimerConfig) => {
    setConfig(c);
    reset();
  }, [reset]);

  const handleNLConfig = useCallback((c: TimerConfig, description?: string) => {
    setConfig(c);
    if (description) setLastDescription(description);
    reset();
  }, [reset]);

  return (
    <div
      className="app-shell"
      style={{ background: meta.bg, transition: 'background 0.6s ease' }}
    >
      {/* Scanlines overlay */}
      <div className="scanlines" />

      {/* Phase flash */}
      {flashing && (
        <div className="phase-flash" style={{ background: meta.color }} />
      )}

      {/* Radial glow */}
      <div
        className="radial-glow"
        style={{
          background: `radial-gradient(circle, ${meta.glow} 0%, transparent 65%)`,
          transition: 'background 0.5s ease',
        }}
      />

      {/* Corner brackets */}
      <div className="corner-tl" />
      <div className="corner-tr" />
      <div className="corner-bl" />
      <div className="corner-br" />

      {/* ─── Main scrollable content ─────────────────── */}
      <div className="app-content">

        {/* Header */}
        <header className="app-header">
          <span className="app-brand">timer.ai</span>
          <span className="app-tagline">
            {isIdle
              ? formatTotal(config.totalSeconds)
              : formatElapsed(totalElapsed)}
          </span>
        </header>

        {/* NL Input or Manual Config */}
        <section className="input-section">
          {convexEnabled ? (
            <NLInput
              onConfig={(c) => handleNLConfig(c)}
              disabled={isRunning || isPaused}
            />
          ) : (
            <ManualConfig config={config} onChange={handleConfig} />
          )}
        </section>

        {/* ─── Timer ─────────────────────────────────── */}
        <section className="timer-section">

          {/* Phase label */}
          <div
            className="phase-label"
            style={{ color: meta.color, textShadow: `0 0 20px ${meta.color}88` }}
          >
            {meta.label}
          </div>

          {/* Ring */}
          <div className="ring-wrapper">
            <svg
              className="timer-ring"
              viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle cx={CENTER} cy={CENTER} r={RADIUS}
                fill="none" stroke="#16161f" strokeWidth={STROKE} />
              <circle cx={CENTER} cy={CENTER} r={RADIUS}
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
            <div className="ring-center">
              <div
                className="timer-number"
                style={{
                  transform: tickPulse ? 'scale(1.03)' : 'scale(1)',
                  transition: 'transform 0.1s ease-out',
                  textShadow: phase !== 'IDLE' ? `0 0 40px ${meta.color}44` : 'none',
                  color: isComplete ? meta.color : '#ffffff',
                }}
              >
                {isIdle ? '--' : isComplete ? '✓' : secondsLeft}
              </div>

              {!isIdle && !isComplete && (
                <div className="round-label">
                  R{currentRound}/{config.rounds}
                  {config.sets > 1 && ` · S${currentSet}/${config.sets}`}
                </div>
              )}
            </div>
          </div>

          {/* Config summary (idle) */}
          {isIdle && (
            <div className="config-summary">
              {config.work}s · {config.rest}s · {config.rounds}R
              {config.sets > 1 && ` · ${config.sets} SETS`}
            </div>
          )}

          {/* Workout complete */}
          {isComplete && (
            <div
              className="complete-msg"
              style={{ color: meta.color, textShadow: `0 0 16px ${meta.color}88` }}
            >
              WORKOUT COMPLETE
            </div>
          )}

          {/* Controls */}
          <div className="controls">
            {isIdle && (
              <button
                onClick={start}
                className="btn-primary ctrl-btn"
                style={{ '--btn-color': meta.color } as React.CSSProperties}
              >
                START
              </button>
            )}

            {isRunning && (
              <button onClick={pause} className="btn-secondary ctrl-btn">
                PAUSE
              </button>
            )}

            {isPaused && (
              <button
                onClick={resume}
                className="btn-primary ctrl-btn"
                style={{ '--btn-color': meta.color } as React.CSSProperties}
              >
                RESUME
              </button>
            )}

            {(isPaused || isComplete || isRunning) && (
              <button onClick={reset} className="btn-ghost ctrl-btn">
                RESET
              </button>
            )}
          </div>
        </section>

        {/* ─── Presets (Convex only) ──────────────────── */}
        {convexEnabled && (
          <PresetList
            onLoad={handleConfig}
            currentConfig={config}
            lastDescription={lastDescription}
          />
        )}

        {/* Bottom spacer */}
        <div style={{ height: '2rem' }} />
      </div>
    </div>
  );
}
