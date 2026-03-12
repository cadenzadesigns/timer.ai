import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { makeTimerConfig } from '@timer-ai/core';
import type { TimerConfig, TimerPhase } from '@timer-ai/core';
import { TimerRing } from './src/components/TimerRing';
import { useTimer } from './src/hooks/useTimer';
import { useAudio } from './src/hooks/useAudio';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = makeTimerConfig(20, 10, 8, 1, 0, '3-2-1');

const PHASE_COLOR: Record<TimerPhase, string> = {
  IDLE:               '#4a4a5a',
  COUNTDOWN:          '#FFD600',
  WORK:               '#FF3300',
  REST:               '#00CCFF',
  REST_BETWEEN_SETS:  '#00CCFF',
  COMPLETE:           '#00FF88',
};

const PHASE_LABEL: Record<TimerPhase, string> = {
  IDLE:               'READY',
  COUNTDOWN:          'GET SET',
  WORK:               'WORK',
  REST:               'REST',
  REST_BETWEEN_SETS:  'SET REST',
  COMPLETE:           'DONE',
};

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
const { width: SW } = Dimensions.get('window');
const RING_SIZE = Math.min(SW - 80, 280);

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTotal(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec > 0 ? ' ' + sec + 's' : ''}` : `${sec}s`;
}

async function convexParseWorkout(description: string): Promise<TimerConfig & { name?: string }> {
  if (!CONVEX_URL) throw new Error('EXPO_PUBLIC_CONVEX_URL not set');
  const res = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'parseWorkout:parseWorkout', args: { description } }),
  });
  if (!res.ok) throw new Error(`Parse failed (${res.status})`);
  const json = await res.json();
  // Convex HTTP API wraps the return value in { value: ... }
  return json.value ?? json;
}

// ─── Preset card ────────────────────────────────────────────────────────────

interface Preset {
  _id: string;
  name: string;
  config: TimerConfig;
}

function PresetCard({ preset, onLoad }: { preset: Preset; onLoad: () => void }) {
  const c = preset.config;
  return (
    <TouchableOpacity style={styles.presetCard} onPress={onLoad} activeOpacity={0.7}>
      <View style={styles.presetInner}>
        <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
        <Text style={styles.presetDetail}>
          {c.work}s · {c.rest}s · {c.infinite ? '∞' : c.rounds + 'R'}
          {c.sets > 1 ? ` · ${c.sets}S` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);

  const audio = useAudio();
  const { state, start, pause, resume, reset } = useTimer(config, audio);
  const { phase, secondsLeft, currentRound, currentSet, paused } = state;

  // Keep screen awake the whole time the app is open during a workout
  useKeepAwake();

  const phaseColor = PHASE_COLOR[phase];
  const phaseLabel = PHASE_LABEL[phase];
  const isRunning  = phase !== 'IDLE' && phase !== 'COMPLETE' && !paused;
  const isPaused   = paused && phase !== 'IDLE' && phase !== 'COMPLETE';
  const isComplete = phase === 'COMPLETE';
  const isIdle     = phase === 'IDLE';

  const phaseDuration =
    phase === 'WORK'               ? config.work :
    phase === 'REST'               ? config.rest :
    phase === 'REST_BETWEEN_SETS'  ? config.restBetweenSets :
    phase === 'COUNTDOWN'          ? 3 : 0;
  const progress = phaseDuration > 0 ? secondsLeft / phaseDuration : 1;

  function handleConfig(c: TimerConfig) {
    setConfig(c);
    reset();
    setParseError(null);
  }

  async function handleParse() {
    const trimmed = inputText.trim();
    if (!trimmed || parsing) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await convexParseWorkout(trimmed);
      const cfg = makeTimerConfig(
        result.work, result.rest, result.rounds,
        result.sets, result.restBetweenSets,
        result.countdown, result.infinite,
      );
      handleConfig(cfg);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parse failed. Try again.');
    } finally {
      setParsing(false);
    }
  }

  const canParse = !!CONVEX_URL && !isRunning && !isPaused;

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#1a1a2e" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.brand}>timer.ai</Text>
          <Text style={styles.tagline}>
            {isIdle ? fmtTotal(config.totalSeconds) : ''}
          </Text>
        </View>

        {/* ── NL Input (requires Convex) ─────────────── */}
        {canParse && (
          <View style={styles.inputSection}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Describe your workout…"
                placeholderTextColor="#6060a0"
                multiline
                numberOfLines={2}
                editable={!parsing}
                returnKeyType="done"
                onSubmitEditing={handleParse}
              />
              <TouchableOpacity
                style={[styles.parseBtn, (!inputText.trim() || parsing) && styles.parseBtnDisabled]}
                onPress={handleParse}
                disabled={!inputText.trim() || parsing}
                activeOpacity={0.75}
              >
                {parsing
                  ? <ActivityIndicator size="small" color="#FF3300" />
                  : <Text style={styles.parseBtnText}>PARSE</Text>
                }
              </TouchableOpacity>
            </View>
            {parseError != null && (
              <Text style={styles.errorText}>⚠ {parseError}</Text>
            )}
          </View>
        )}

        {!CONVEX_URL && (
          <View style={styles.noConvexHint}>
            <Text style={styles.noConvexText}>
              Set EXPO_PUBLIC_CONVEX_URL to enable AI workout parsing
            </Text>
          </View>
        )}

        {/* ── Timer ──────────────────────────────────── */}
        <View style={styles.timerSection}>

          {/* Phase label */}
          <Text style={[styles.phaseLabel, { color: phaseColor }]}>
            {phaseLabel}
          </Text>

          {/* Ring + center */}
          <View style={[styles.ringWrapper, { width: RING_SIZE, height: RING_SIZE }]}>
            <TimerRing progress={progress} color={phaseColor} size={RING_SIZE} />
            <View style={[styles.ringCenter, { width: RING_SIZE, height: RING_SIZE }]}>
              <Text style={[styles.timerNumber, isComplete && { color: phaseColor }]}>
                {isIdle ? '--' : isComplete ? '✓' : String(secondsLeft)}
              </Text>
              {!isIdle && !isComplete && (
                <Text style={styles.roundLabel}>
                  {config.infinite
                    ? `R${currentRound}`
                    : `R${currentRound}/${config.rounds}${config.sets > 1 ? ` · S${currentSet}/${config.sets}` : ''}`}
                </Text>
              )}
            </View>
          </View>

          {/* Config summary (idle) */}
          {isIdle && (
            <Text style={styles.configSummary}>
              {config.work}s · {config.rest}s · {config.infinite ? '∞' : config.rounds + 'R'}
              {config.sets > 1 ? ` · ${config.sets}S` : ''}
            </Text>
          )}

          {isComplete && (
            <Text style={[styles.completeMsg, { color: phaseColor }]}>
              WORKOUT COMPLETE
            </Text>
          )}

          {/* Controls */}
          <View style={styles.controls}>
            {isIdle && (
              <TouchableOpacity
                style={[styles.btnPrimary, { borderColor: phaseColor }]}
                onPress={start}
                activeOpacity={0.75}
              >
                <Text style={[styles.btnPrimaryText, { color: phaseColor }]}>START</Text>
              </TouchableOpacity>
            )}
            {isRunning && (
              <TouchableOpacity style={styles.btnSecondary} onPress={pause} activeOpacity={0.75}>
                <Text style={styles.btnSecondaryText}>PAUSE</Text>
              </TouchableOpacity>
            )}
            {isPaused && (
              <TouchableOpacity
                style={[styles.btnPrimary, { borderColor: phaseColor }]}
                onPress={resume}
                activeOpacity={0.75}
              >
                <Text style={[styles.btnPrimaryText, { color: phaseColor }]}>RESUME</Text>
              </TouchableOpacity>
            )}
            {(isPaused || isComplete || isRunning) && (
              <TouchableOpacity style={styles.btnGhost} onPress={reset} activeOpacity={0.75}>
                <Text style={styles.btnGhostText}>RESET</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Presets ────────────────────────────────── */}
        {presets.length > 0 && (
          <View style={styles.presetsSection}>
            <Text style={styles.presetsTitle}>PRESETS</Text>
            {presets.map(p => (
              <PresetCard
                key={p._id}
                preset={p}
                onLoad={() => handleConfig(p.config)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const C = {
  bg:       '#1a1a2e',
  surface:  '#181830',
  surface2: '#161628',
  border:   '#2e2e4e',
  border2:  '#3a3a58',
  text:     '#f0f0f0',
  text2:    '#b0b0cc',
  text3:    '#a0a0c0',
  text4:    '#6060a0',
  accent:   '#FF3300',
  mono:     Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
  },

  // Header
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brand: {
    fontFamily: C.mono,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 6,
    color: C.text2,
    textTransform: 'uppercase',
  },
  tagline: {
    fontFamily: C.mono,
    fontSize: 16,
    color: C.text2,
    letterSpacing: 1,
  },

  // NL Input
  inputSection: {
    width: '100%',
    marginBottom: 20,
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  textInput: {
    flex: 1,
    fontFamily: C.mono,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  parseBtn: {
    width: 72,
    height: 52,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parseBtnDisabled: {
    borderColor: C.text4,
    opacity: 0.5,
  },
  parseBtnText: {
    fontFamily: C.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: C.accent,
  },
  errorText: {
    fontFamily: C.mono,
    fontSize: 14,
    color: '#FF6644',
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: C.accent,
  },

  // No convex hint
  noConvexHint: {
    width: '100%',
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 16,
    backgroundColor: C.surface2,
  },
  noConvexText: {
    fontFamily: C.mono,
    fontSize: 13,
    color: C.text4,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Timer
  timerSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  phaseLabel: {
    fontFamily: C.mono,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
    textTransform: 'uppercase',
    marginBottom: 16,
    minHeight: 28,
  },
  ringWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerNumber: {
    fontFamily: C.mono,
    fontSize: 88,
    fontWeight: '900',
    lineHeight: 100,
    color: '#ffffff',
    userSelect: 'none',
  } as any,
  roundLabel: {
    fontFamily: C.mono,
    fontSize: 16,
    color: C.text2,
    letterSpacing: 1,
    marginTop: 4,
  },
  configSummary: {
    fontFamily: C.mono,
    fontSize: 16,
    color: C.text3,
    letterSpacing: 3,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  completeMsg: {
    fontFamily: C.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: 12,
    textTransform: 'uppercase',
  },

  // Controls
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  btnPrimary: {
    minWidth: 96,
    height: 52,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnPrimaryText: {
    fontFamily: C.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
  },
  btnSecondary: {
    minWidth: 96,
    height: 52,
    borderWidth: 1.5,
    borderColor: C.border2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnSecondaryText: {
    fontFamily: C.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    color: C.text2,
  },
  btnGhost: {
    minWidth: 80,
    height: 52,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnGhostText: {
    fontFamily: C.mono,
    fontSize: 14,
    letterSpacing: 4,
    color: C.text4,
  },

  // Presets
  presetsSection: {
    width: '100%',
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 20,
    gap: 6,
  },
  presetsTitle: {
    fontFamily: C.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 6,
    color: C.text3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    backgroundColor: 'rgba(20,20,40,0.3)',
    minHeight: 56,
  },
  presetInner: {
    flex: 1,
    gap: 2,
  },
  presetName: {
    fontFamily: C.mono,
    fontSize: 15,
    color: C.text2,
  },
  presetDetail: {
    fontFamily: C.mono,
    fontSize: 13,
    color: C.text3,
    letterSpacing: 1,
  },
});
