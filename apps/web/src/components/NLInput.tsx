import { useState, useRef } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { TimerConfig } from '@timer-ai/core';

interface Props {
  onConfig: (config: TimerConfig) => void;
  disabled?: boolean;
}

export function NLInput({ onConfig, disabled }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<TimerConfig | null>(null);
  const parseWorkout = useAction(api.parseWorkout.parseWorkout);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parseWorkout({ description: trimmed });
      setLastParsed(result as TimerConfig);
      onConfig(result as TimerConfig);
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

  function formatConfig(c: TimerConfig) {
    const parts = [`${c.work}s WORK`, `${c.rest}s REST`, `${c.rounds} RDS`];
    if (c.sets > 1) parts.push(`${c.sets} SETS`);
    return parts.join(' · ');
  }

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
          {loading ? (
            <span className="nl-spinner" />
          ) : (
            'PARSE'
          )}
        </button>
      </div>

      {error && (
        <div className="nl-feedback nl-error">
          ⚠ {error}
        </div>
      )}

      {lastParsed && !error && !loading && (
        <div className="nl-feedback nl-success">
          ✓ {formatConfig(lastParsed)}
        </div>
      )}
    </div>
  );
}
