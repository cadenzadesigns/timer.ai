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
    const parts = [`${c.work}s / ${c.rest}s`, `${c.rounds} rds`];
    if (c.sets > 1) parts.push(`${c.sets} sets`);
    return parts.join(' · ');
  }

  async function handleSave() {
    const name = lastDescription?.trim()
      ? lastDescription.slice(0, 60)
      : `${currentConfig.work}s/${currentConfig.rest}s×${currentConfig.rounds}`;
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
