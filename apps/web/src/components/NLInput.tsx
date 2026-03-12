import { useState, useRef, useEffect } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { TimerConfig } from '@timer-ai/core';
import { makeTimerConfig } from '@timer-ai/core';

interface Props {
  onConfig: (config: TimerConfig, name?: string) => void;
  disabled?: boolean;
}

interface ParsedResult {
  config: TimerConfig;
  requestedTotalSeconds?: number;
  work: number;
  rest: number;
  rounds: number;
  dismissedWarning: boolean;
}

function formatTotal(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec > 0 ? ' ' + sec + 's' : ''}` : `${sec}s`;
}

function computeTotal(p: ParsedResult): number {
  return (p.work + p.rest) * p.rounds * p.config.sets
    + p.config.restBetweenSets * Math.max(0, p.config.sets - 1);
}

interface EditableChipProps {
  value: number;
  unit?: string;
  label: string;
  editing: boolean;
  onTap: () => void;
  onChange: (v: number) => void;
  onBlur: () => void;
  min?: number;
  max?: number;
}

function EditableChip({ value, unit = '', label, editing, onTap, onChange, onBlur, min = 0, max = 9999 }: EditableChipProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <span className="chip-editing">
        <input
          ref={inputRef}
          type="number"
          className="chip-input"
          defaultValue={value}
          min={min}
          max={max}
          onBlur={e => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || value));
            onChange(v);
            onBlur();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { onBlur(); }
          }}
        />
        <span className="chip-unit-label">{unit} {label}</span>
      </span>
    );
  }

  return (
    <button className="chip-tappable" onClick={onTap} title={`Tap to edit ${label}`} type="button">
      <span className="chip-val">{value}{unit}</span>
      <span className="chip-lbl">{label}</span>
    </button>
  );
}

export function NLInput({ onConfig, disabled }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [editingField, setEditingField] = useState<'work' | 'rest' | 'rounds' | null>(null);
  const parseWorkout = useAction(api.parseWorkout.parseWorkout);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setEditingField(null);
    try {
      const result = await parseWorkout({ description: trimmed }) as TimerConfig & { requestedTotalSeconds?: number; name?: string };
      const newParsed: ParsedResult = {
        config: result,
        requestedTotalSeconds: result.requestedTotalSeconds,
        work: result.work,
        rest: result.rest,
        rounds: result.rounds,
        dismissedWarning: false,
      };
      setParsed(newParsed);
      onConfig(result, result.name || trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  }

  function applyDrafts(p: ParsedResult, work: number, rest: number, rounds: number) {
    const newConfig = makeTimerConfig(work, rest, rounds, p.config.sets, p.config.restBetweenSets, p.config.countdown, p.config.infinite);
    onConfig(newConfig);
  }

  function updateField(field: 'work' | 'rest' | 'rounds', value: number) {
    if (!parsed) return;
    const next = { ...parsed, [field]: value };
    setParsed(next);
    applyDrafts(next, next.work, next.rest, next.rounds);
  }

  function adjustRounds() {
    if (!parsed?.requestedTotalSeconds) return;
    const newRounds = Math.max(1, Math.min(100,
      Math.round(parsed.requestedTotalSeconds / Math.max(1, parsed.work + parsed.rest))
    ));
    const next = { ...parsed, rounds: newRounds, dismissedWarning: true };
    setParsed(next);
    applyDrafts(next, next.work, next.rest, next.rounds);
  }

  function dismissWarning() {
    setParsed(prev => prev ? { ...prev, dismissedWarning: true } : null);
  }

  const showMismatch = parsed && !parsed.dismissedWarning
    && parsed.requestedTotalSeconds != null
    && Math.abs(computeTotal(parsed) - parsed.requestedTotalSeconds) >= 3;

  return (
    <div className="nl-input-wrapper">
      <div className="nl-input-row">
        <textarea
          ref={textareaRef}
          className="nl-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your workout… e.g. Tabata, 30 on 15 off 6 rounds, EMOM 10 min"
          rows={2}
          disabled={disabled || loading}
        />
        <button
          className="nl-parse-btn"
          onClick={handleParse}
          disabled={!text.trim() || loading || disabled}
        >
          {loading ? <span className="nl-spinner" /> : 'PARSE'}
        </button>
      </div>

      {error && (
        <div className="nl-feedback nl-error">⚠ {error}</div>
      )}

      {parsed && !error && !loading && (
        <div className="nl-parsed">
          {/* Editable chips row */}
          <div className="nl-parsed-chips">
            <EditableChip
              value={parsed.work} unit="s" label="WORK"
              editing={editingField === 'work'}
              onTap={() => setEditingField('work')}
              onChange={v => updateField('work', v)}
              onBlur={() => setEditingField(null)}
              min={5} max={3600}
            />
            <span className="chip-dot">·</span>
            <EditableChip
              value={parsed.rest} unit="s" label="REST"
              editing={editingField === 'rest'}
              onTap={() => setEditingField('rest')}
              onChange={v => updateField('rest', v)}
              onBlur={() => setEditingField(null)}
              min={0} max={3600}
            />
            <span className="chip-dot">·</span>
            {parsed.config.infinite ? (
              <span className="chip-static">∞ LOOP</span>
            ) : (
              <EditableChip
                value={parsed.rounds} label="RDS"
                editing={editingField === 'rounds'}
                onTap={() => setEditingField('rounds')}
                onChange={v => updateField('rounds', v)}
                onBlur={() => setEditingField(null)}
                min={1} max={100}
              />
            )}
            {parsed.config.sets > 1 && (
              <>
                <span className="chip-dot">·</span>
                <span className="chip-static">{parsed.config.sets} SETS</span>
              </>
            )}
          </div>

          {/* Total time */}
          <div className="nl-total">
            <span className="nl-total-label">TOTAL</span>
            <span className="nl-total-value">
              {parsed.config.infinite ? '∞ until stopped' : formatTotal(computeTotal(parsed))}
            </span>
          </div>

          {/* Mismatch warning */}
          {showMismatch && (
            <div className="nl-mismatch">
              <div className="nl-mismatch-text">
                ⚠ Parsed as {formatTotal(computeTotal(parsed))} · you asked for {formatTotal(parsed.requestedTotalSeconds!)}
              </div>
              <div className="nl-mismatch-actions">
                <button className="nl-mismatch-btn-primary" onClick={adjustRounds} type="button">
                  Adjust rounds to fit {formatTotal(parsed.requestedTotalSeconds!)}
                </button>
                <button className="nl-mismatch-btn-ghost" onClick={dismissWarning} type="button">
                  Keep as parsed
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
