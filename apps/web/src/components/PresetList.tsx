import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { api } from '../../convex/_generated/api';
import type { TimerConfig } from '@timer-ai/core';

interface Props {
  onLoad: (config: TimerConfig) => void;
  currentConfig: TimerConfig;
  lastDescription?: string;
  clerkEnabled?: boolean;
}

export function PresetList(props: Props) {
  if (props.clerkEnabled) {
    return <AuthPresetList {...props} />;
  }
  // Clerk not configured — presets require sign-in
  return (
    <div className="presets-section">
      <div className="presets-header">
        <span className="presets-title">PRESETS</span>
      </div>
      <div className="presets-empty">Sign in to save presets</div>
    </div>
  );
}

// ─── Auth-aware inner component (always inside ClerkProvider) ─────────────────

function AuthPresetList({ onLoad, currentConfig, lastDescription }: Props) {
  const presets = useQuery(api.presets.list) as
    | { personal: any[]; org: any[] }
    | undefined;
  const createPreset = useMutation(api.presets.create);
  const removePreset = useMutation(api.presets.remove);
  const [collapsed, setCollapsed] = useState(false);

  function formatConfig(c: TimerConfig) {
    const work =
      c.work >= 60
        ? `${Math.floor(c.work / 60)}m${c.work % 60 ? c.work % 60 + 's' : ''}`
        : `${c.work}s`;
    const rest =
      c.rest >= 60
        ? `${Math.floor(c.rest / 60)}m${c.rest % 60 ? c.rest % 60 + 's' : ''}`
        : `${c.rest}s`;
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
    const work =
      c.work >= 60 ? `${Math.floor(c.work / 60)}min` : `${c.work}s`;
    const rest =
      c.rest > 0
        ? c.rest >= 60
          ? `${Math.floor(c.rest / 60)}min rest`
          : `${c.rest}s rest`
        : 'no rest';
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
      scope: 'personal',
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

  const personal = presets.personal ?? [];
  const org = presets.org ?? [];

  return (
    <div className="presets-section">
      <div className="presets-header">
        <span className="presets-title presets-toggle" onClick={() => setCollapsed(c => !c)}>
          PRESETS {collapsed ? '▸' : '▾'}
        </span>

        {!collapsed && <SignedIn>
          <div className="presets-header-right">
            <button className="btn-ghost preset-save-btn" onClick={handleSave}>
              + SAVE CURRENT
            </button>
          </div>
        </SignedIn>}

        {!collapsed && <SignedOut>
          <SignInButton mode="modal">
            <button className="btn-ghost preset-save-btn preset-signin-hint">
              SIGN IN TO SAVE
            </button>
          </SignInButton>
        </SignedOut>}
      </div>

      {!collapsed && <>
        {/* Personal presets */}
        <SignedIn>
          {personal.length === 0 && org.length === 0 ? (
            <div className="presets-empty">
              No presets yet — parse a workout and save it
            </div>
          ) : (
            <>
              <div className="presets-list">
                {personal.map((preset: any) => (
                  <PresetCard
                    key={preset._id}
                    preset={preset}
                    onLoad={() => onLoad(preset.config as TimerConfig)}
                    onDelete={() => removePreset({ id: preset._id })}
                    formatConfig={formatConfig}
                  />
                ))}
                {org.map((preset: any) => (
                  <PresetCard
                    key={preset._id}
                    preset={preset}
                    onLoad={() => onLoad(preset.config as TimerConfig)}
                    onDelete={() => removePreset({ id: preset._id })}
                    formatConfig={formatConfig}
                  />
                ))}
              </div>
            </>
          )}
        </SignedIn>

        <SignedOut>
          <div className="presets-empty">Sign in to view and save presets</div>
        </SignedOut>
      </>}
    </div>
  );
}

// ─── Preset card ──────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  onLoad,
  onDelete,
  formatConfig,
}: {
  preset: any;
  onLoad: () => void;
  onDelete: () => void;
  formatConfig: (c: TimerConfig) => string;
}) {
  return (
    <div className="preset-card" onClick={onLoad}>
      <div className="preset-card-inner">
        <div className="preset-name">{preset.name}</div>
        <div className="preset-detail">
          {formatConfig(preset.config as TimerConfig)}
        </div>
      </div>
      <button
        className="preset-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete preset"
      >
        ×
      </button>
    </div>
  );
}
