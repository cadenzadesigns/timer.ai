import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { TimerConfig } from '@timer-ai/core';

interface Props {
  onLoad: (config: TimerConfig) => void;
  currentConfig: TimerConfig;
  lastDescription?: string;
}

export function PresetList({ onLoad, currentConfig, lastDescription }: Props) {
  const presets = useQuery(api.presets.list);
  const createPreset = useMutation(api.presets.create);
  const removePreset = useMutation(api.presets.remove);

  function formatConfig(c: TimerConfig) {
    const work = c.work >= 60 ? `${Math.floor(c.work / 60)}m${c.work % 60 ? c.work % 60 + 's' : ''}` : `${c.work}s`;
    const rest = c.rest >= 60 ? `${Math.floor(c.rest / 60)}m${c.rest % 60 ? c.rest % 60 + 's' : ''}` : `${c.rest}s`;
    const parts = [`${work} work`, `${rest} rest`];
    if ((c as any).infinite) {
      parts.push('∞ loop');
    } else {
      parts.push(`${c.rounds} rounds`);
      if (c.sets > 1) parts.push(`${c.sets} sets`);
    }
    return parts.join(' · ');
  }

  function humanName(c: TimerConfig) {
    const work = c.work >= 60 ? `${Math.floor(c.work / 60)}min` : `${c.work}s`;
    const rest = c.rest > 0 ? (c.rest >= 60 ? `${Math.floor(c.rest / 60)}min rest` : `${c.rest}s rest`) : 'no rest';
    if ((c as any).infinite) return `Every ${work}, ${rest}`;
    const rounds = `${c.rounds} round${c.rounds > 1 ? 's' : ''}`;
    const sets = c.sets > 1 ? `, ${c.sets} sets` : '';
    return `${work} on / ${rest} × ${rounds}${sets}`;
  }

  async function handleSave() {
    const name = lastDescription?.trim()
      ? lastDescription.slice(0, 60)
      : humanName(currentConfig);
    await createPreset({
      name,
      description: lastDescription || name,
      config: currentConfig,
    });
  }

  if (presets === undefined) {
    return (
      <div className="presets-section">
        <div className="presets-loading">Loading presets…</div>
      </div>
    );
  }

  return (
    <div className="presets-section">
      <div className="presets-header">
        <span className="presets-title">PRESETS</span>
        <button className="btn-ghost preset-save-btn" onClick={handleSave}>
          + SAVE CURRENT
        </button>
      </div>

      {presets.length === 0 ? (
        <div className="presets-empty">
          No presets yet — parse a workout and save it
        </div>
      ) : (
        <div className="presets-list">
          {presets.map((preset: any) => (
            <div
              key={preset._id}
              className="preset-card"
              onClick={() => onLoad(preset.config as TimerConfig)}
            >
              <div className="preset-card-inner">
                <div className="preset-name">{preset.name}</div>
                <div className="preset-detail">{formatConfig(preset.config as TimerConfig)}</div>
              </div>
              <button
                className="preset-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  removePreset({ id: preset._id });
                }}
                aria-label="Delete preset"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
