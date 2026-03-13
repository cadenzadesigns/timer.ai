// Clerk's JS SDK checks navigator.onLine which is unreliable in React Native.
// Force it to true so getToken() doesn't throw "clerk_offline".
if (typeof globalThis.navigator !== 'undefined' && !globalThis.navigator.onLine) {
  Object.defineProperty(globalThis.navigator, 'onLine', { get: () => true });
}

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Platform, ActivityIndicator,
  Modal, Animated, KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as SecureStore from 'expo-secure-store';
import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { tokenCache } from '@clerk/expo/token-cache';
import { makeTimerConfig } from '@timer-ai/core';
import type { TimerConfig, TimerPhase } from '@timer-ai/core';
import { TimerRing } from './src/components/TimerRing';
import { useTimer } from './src/hooks/useTimer';
import { useAudio } from './src/hooks/useAudio';

// ─── Constants ────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light';

const MONO = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
}) as string;

const { width: SW } = Dimensions.get('window');
const RING_SIZE = Math.min(SW - 56, 300);
const KEEP_AWAKE_TAG = 'timer-active';
const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const DEFAULT_CONFIG = makeTimerConfig(20, 10, 8, 1, 0, '3-2-1');

// ─── Theme ────────────────────────────────────────────────────────────────────

const DARK = {
  bg:        '#1a1a2e',
  surface:   '#181830',
  surface2:  '#161628',
  border:    '#2e2e4e',
  border2:   '#3a3a58',
  text:      '#f0f0f0',
  text2:     '#b0b0cc',
  text3:     '#a0a0c0',
  text4:     '#6060a0',
  accent:    '#FF3300',
  mono:      MONO,
};

const LIGHT = {
  bg:        '#f0f0ea',
  surface:   '#e8e8e2',
  surface2:  '#e0e0da',
  border:    '#c4c4d8',
  border2:   '#b4b4cc',
  text:      '#18182c',
  text2:     '#4a4a6a',
  text3:     '#5a5a80',
  text4:     '#7070a0',
  accent:    '#FF3300',
  mono:      MONO,
};

type Colors = typeof DARK;

// ─── Phase Data ───────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTotal(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec > 0 ? ' ' + sec + 's' : ''}` : `${sec}s`;
}

function fmtElapsed(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function computeTotal(work: number, rest: number, rounds: number, config: TimerConfig): number {
  return (work + rest) * rounds * config.sets
    + config.restBetweenSets * Math.max(0, config.sets - 1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preset {
  _id: string;
  name: string;
  description?: string;
  scope: 'personal' | 'org';
  config: TimerConfig;
}

interface ParsedResult {
  config: TimerConfig;
  requestedTotalSeconds?: number;
  work: number;
  rest: number;
  rounds: number;
  dismissedWarning: boolean;
}

// ─── Convex HTTP Helpers ──────────────────────────────────────────────────────

async function convexCall(
  endpoint: 'query' | 'mutation' | 'action',
  path: string,
  args: object,
  token?: string | null,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${CONVEX_URL}/api/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path, args }),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  return json.value ?? json;
}

// ─── Clerk Auth Hook (uses @clerk/expo SDK) ──────────────────────────────────

interface ClerkUserInfo { email: string; name: string | null }

function useClerkAuth() {
  const { isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const { user, isLoaded } = useUser();

  const userInfo: ClerkUserInfo | null = user ? {
    email: user.emailAddresses?.[0]?.emailAddress ?? '',
    name: user.fullName ?? null,
  } : null;

  const getConvexToken = useCallback(async (): Promise<string | null> => {
    try {
      return await getToken({ template: 'convex' });
    } catch { return null; }
  }, [getToken]);

  const signOut = useCallback(async () => {
    try { await clerkSignOut(); } catch {}
  }, [clerkSignOut]);

  return {
    isSignedIn: !!isSignedIn,
    userInfo,
    authLoading: !isLoaded,
    signOut,
    getConvexToken,
  };
}

// ─── EditableChip ─────────────────────────────────────────────────────────────

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
  C: Colors;
}

function EditableChip({
  value, unit = '', label,
  editing, onTap, onChange, onBlur,
  min = 0, max = 9999, C,
}: EditableChipProps) {
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editing]);

  if (editing) {
    return (
      <View style={chipS.editRow}>
        <TextInput
          ref={inputRef}
          style={[chipS.input, {
            color: C.text,
            backgroundColor: C.surface2,
            borderColor: C.accent,
            fontFamily: C.mono,
          }]}
          value={draft}
          onChangeText={setDraft}
          keyboardType="number-pad"
          selectTextOnFocus
          onBlur={() => {
            const v = Math.max(min, Math.min(max, Number(draft) || value));
            onChange(v);
            onBlur();
          }}
          onSubmitEditing={() => {
            const v = Math.max(min, Math.min(max, Number(draft) || value));
            onChange(v);
            onBlur();
          }}
        />
        <Text style={[chipS.editLabel, { color: C.text4, fontFamily: C.mono }]}>
          {unit ? unit + ' ' : ''}{label}
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onTap}
      style={[chipS.chip, { borderColor: C.border2, backgroundColor: C.surface2 }]}
      activeOpacity={0.65}
    >
      <Text style={[chipS.val, { color: C.text, fontFamily: C.mono }]}>{value}{unit}</Text>
      <Text style={[chipS.lbl, { color: C.text4, fontFamily: C.mono }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipS = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  val:       { fontSize: 15, fontWeight: '700' },
  lbl:       { fontSize: 11, letterSpacing: 1 },
  editRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 68,
    height: 36,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  editLabel: { fontSize: 12, letterSpacing: 0.5 },
});

// ─── TogglePill ───────────────────────────────────────────────────────────────

function TogglePill({ value, onToggle, label, C }: {
  value: boolean;
  onToggle: () => void;
  label?: string;
  C: Colors;
}) {
  return (
    <TouchableOpacity
      style={[pillS.pill, {
        borderColor: value ? C.accent : C.border2,
        backgroundColor: value ? C.accent : 'transparent',
      }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Text style={[pillS.text, { color: value ? '#fff' : C.text3, fontFamily: C.mono }]}>
        {label ?? (value ? 'ON' : 'OFF')}
      </Text>
    </TouchableOpacity>
  );
}

const pillS = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    minWidth: 64,
    alignItems: 'center',
  },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
});

// ─── SettingsRow ──────────────────────────────────────────────────────────────

function SettingsRow({ label, desc, children, C }: {
  label: string;
  desc: string;
  children: React.ReactNode;
  C: Colors;
}) {
  return (
    <View style={[settS.row, { borderBottomColor: C.border }]}>
      <View style={settS.rowInfo}>
        <Text style={[settS.rowLabel, { color: C.text2, fontFamily: C.mono }]}>{label}</Text>
        <Text style={[settS.rowDesc, { color: C.text4, fontFamily: C.mono }]}>{desc}</Text>
      </View>
      <View style={settS.rowControl}>{children}</View>
    </View>
  );
}

// ─── Native Auth Modal ─────────────────────────────────────────────────────────
// Wraps Clerk's native AuthView in a RN Modal. Auto-closes on successful auth.

function ClerkAuthModal({ visible, onClose, C }: {
  visible: boolean;
  onClose: () => void;
  C: Colors;
}) {
  const { isSignedIn } = useAuth();

  // Auto-close when auth completes
  useEffect(() => {
    if (visible && isSignedIn) onClose();
  }, [visible, isSignedIn, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={cam.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[cam.closeBtn, { color: C.text4, fontFamily: C.mono }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <AuthView mode="signInOrUp" isDismissable={false} />
      </View>
    </Modal>
  );
}

const cam = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 8,
  },
  closeBtn: {
    fontSize: 20,
    fontWeight: '600',
  },
});

// ─── User section in settings ─────────────────────────────────────────────────
// Props-based — no Clerk hooks, works without ClerkProvider.

function UserSection({ C, isSignedIn, userInfo, onSignIn, onSignOut }: {
  C: Colors;
  isSignedIn: boolean;
  userInfo: ClerkUserInfo | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (!isSignedIn) {
    return (
      <View style={[authS.section, { borderBottomColor: C.border }]}>
        <Text style={[authS.sectionLabel, { color: C.text4, fontFamily: C.mono }]}>ACCOUNT</Text>
        <TouchableOpacity
          style={[authS.signInBtn, { borderColor: C.accent }]}
          onPress={onSignIn}
          activeOpacity={0.7}
        >
          <Text style={[authA.signInText, { color: C.accent, fontFamily: C.mono }]}>
            SIGN IN
          </Text>
        </TouchableOpacity>
        <Text style={[authA.hint, { color: C.text4, fontFamily: C.mono }]}>
          Save and sync presets across devices
        </Text>
      </View>
    );
  }

  const displayName = userInfo?.name || userInfo?.email || 'Signed in';
  const displayEmail = userInfo?.name && userInfo?.email ? userInfo.email : null;

  return (
    <View style={[authS.section, { borderBottomColor: C.border }]}>
      <Text style={[authS.sectionLabel, { color: C.text4, fontFamily: C.mono }]}>ACCOUNT</Text>
      <View style={authS.userRow}>
        <View style={authS.userInfo}>
          <Text style={[authS.userEmail, { color: C.text2, fontFamily: C.mono }]} numberOfLines={1}>
            {displayName}
          </Text>
          {displayEmail && (
            <Text style={[authS.userOrg, { color: C.text4, fontFamily: C.mono }]} numberOfLines={1}>
              {displayEmail}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[authS.signOutBtn, { borderColor: C.border2 }]}
          onPress={onSignOut}
          activeOpacity={0.7}
        >
          <Text style={[authS.signOutText, { color: C.text4, fontFamily: C.mono }]}>
            SIGN OUT
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const authS = StyleSheet.create({
  section: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userInfo: { flex: 1, gap: 2 },
  userEmail: { fontSize: 13, letterSpacing: 0.3 },
  userOrg:   { fontSize: 11, letterSpacing: 0.5, opacity: 0.7 },
  signOutBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  signOutText:  { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  signInBtn: {
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orgName:   { fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  orgActive: { fontSize: 10 },
});

// Extra styles referenced in authS but defined separately to avoid circular refs
const authA = StyleSheet.create({
  signInText: { fontSize: 13, fontWeight: '700', letterSpacing: 4 },
  hint: { fontSize: 11, letterSpacing: 0.5, opacity: 0.7 },
});

// ─── Auth-aware presets section ───────────────────────────────────────────────
// Props-based — receives getConvexToken instead of using Clerk hooks.

function AuthAwarePresets({
  isTimerActive, config, lastDescription, onLoad, C,
  isSignedIn, getConvexToken,
}: {
  isTimerActive: boolean;
  config: TimerConfig;
  lastDescription: string;
  onLoad: (c: TimerConfig, name: string) => void;
  C: Colors;
  isSignedIn: boolean;
  getConvexToken: () => Promise<string | null>;
}) {
  const [presets, setPresets] = useState<{ personal: Preset[]; org: Preset[] }>({
    personal: [],
    org: [],
  });
  const [savingPreset, setSavingPreset] = useState(false);

  const fetchWithAuth = useCallback(async (
    endpoint: 'query' | 'mutation' | 'action',
    path: string,
    args: object,
  ) => {
    if (!CONVEX_URL) return null;
    const token = isSignedIn ? await getConvexToken() : null;
    return convexCall(endpoint, path, args, token);
  }, [isSignedIn, getConvexToken]);

  const loadPresets = useCallback(async () => {
    if (!isSignedIn) { setPresets({ personal: [], org: [] }); return; }
    try {
      const data = await fetchWithAuth('query', 'presets:list', {});
      if (data && typeof data === 'object' && 'personal' in data) {
        setPresets(data as { personal: Preset[]; org: Preset[] });
      }
    } catch { /* silent */ }
  }, [fetchWithAuth, isSignedIn]);

  useEffect(() => { loadPresets(); }, [isSignedIn]);

  async function handleSavePreset() {
    if (savingPreset || isTimerActive || !isSignedIn) return;
    const name = lastDescription?.trim()
      ? lastDescription.slice(0, 60)
      : `${config.work}s · ${config.rest}s · ${config.infinite ? '∞' : config.rounds + 'R'}`;
    setSavingPreset(true);
    try {
      await fetchWithAuth('mutation', 'presets:create', {
        name,
        config,
        description: lastDescription || '',
        scope: 'personal',
      });
      await loadPresets();
    } catch { /* silent */ }
    finally { setSavingPreset(false); }
  }

  async function handleDeletePreset(id: string) {
    setPresets(prev => ({
      personal: prev.personal.filter(p => p._id !== id),
      org: prev.org.filter(p => p._id !== id),
    }));
    try { await fetchWithAuth('mutation', 'presets:remove', { id }); }
    catch { await loadPresets(); }
  }

  const allEmpty = presets.personal.length === 0 && presets.org.length === 0;

  return (
    <View style={S.presetsSection}>
      <SectionDivider label="PRESETS" C={C} />

      {/* Save row */}
      <View style={S.presetsTitleRow}>
        {isSignedIn ? (
          <TouchableOpacity
            style={[S.saveBtn, {
              borderColor: isTimerActive ? C.border : C.accent,
              opacity: isTimerActive ? 0.4 : 1,
            }]}
            onPress={handleSavePreset}
            disabled={isTimerActive || savingPreset}
            activeOpacity={0.7}
          >
            {savingPreset
              ? <ActivityIndicator size="small" color={C.accent} />
              : <Text style={[S.saveBtnText, { color: C.accent, fontFamily: C.mono }]}>
                  + SAVE CURRENT
                </Text>
            }
          </TouchableOpacity>
        ) : (
          <Text style={[presS.signInHint, { color: C.text4, fontFamily: C.mono }]}>
            Sign in to save presets
          </Text>
        )}
      </View>

      {/* Presets lists */}
      {isSignedIn ? (
        allEmpty ? (
          <Text style={[S.presetsEmpty, { color: C.text4, fontFamily: C.mono }]}>
            No presets yet — parse a workout and save it
          </Text>
        ) : (
          <>
            {presets.personal.length > 0 && (
              <>
                {presets.personal.map(p => (
                  <PresetCard
                    key={p._id}
                    preset={p}
                    onLoad={() => onLoad(p.config, p.name)}
                    onDelete={() => handleDeletePreset(p._id)}
                    C={C}
                  />
                ))}
              </>
            )}

            {presets.org.length > 0 && (
              <>
                <Text style={[presS.sectionLabel, { color: C.text4, fontFamily: C.mono }]}>
                  TEAM
                </Text>
                {presets.org.map(p => (
                  <PresetCard
                    key={p._id}
                    preset={p}
                    onLoad={() => onLoad(p.config, p.name)}
                    onDelete={() => handleDeletePreset(p._id)}
                    C={C}
                  />
                ))}
              </>
            )}
          </>
        )
      ) : (
        <Text style={[S.presetsEmpty, { color: C.text4, fontFamily: C.mono }]}>
          Sign in to view and save presets
        </Text>
      )}
    </View>
  );
}

const presS = StyleSheet.create({
  scopeToggle: { flexDirection: 'row', gap: 0, marginBottom: 10 },
  scopeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  scopeBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: 12,
    marginBottom: 6,
  },
  signInHint: {
    fontSize: 12,
    letterSpacing: 0.5,
    opacity: 0.7,
  },
});

// ─── PresetCard ───────────────────────────────────────────────────────────────

function PresetCard({ preset, onLoad, onDelete, C }: {
  preset: Preset;
  onLoad: () => void;
  onDelete: () => void;
  C: Colors;
}) {
  const c = preset.config;
  const detail = [
    `${c.work}s work`,
    `${c.rest}s rest`,
    c.infinite ? '∞ loop' : `${c.rounds}R`,
    c.sets > 1 ? `${c.sets} sets` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[presetS.card, { borderColor: C.border, backgroundColor: C.surface2 }]}>
      <View style={[presetS.leftAccent, { backgroundColor: C.border2 }]} />
      <TouchableOpacity style={presetS.info} onPress={onLoad} activeOpacity={0.7}>
        <Text style={[presetS.name, { color: C.text2, fontFamily: C.mono }]} numberOfLines={1}>
          {preset.name}
        </Text>
        <Text style={[presetS.detail, { color: C.text4, fontFamily: C.mono }]} numberOfLines={1}>
          {detail}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        style={presetS.del}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Text style={[presetS.delText, { color: C.text4, fontFamily: C.mono }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const presetS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 7,
    minHeight: 56,
    overflow: 'hidden',
  },
  leftAccent: { width: 3, alignSelf: 'stretch' },
  info:       { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  name:       { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  detail:     { fontSize: 12, letterSpacing: 0.8 },
  del:        { padding: 16, alignItems: 'center', justifyContent: 'center' },
  delText:    { fontSize: 14 },
});

// ─── SectionDivider ───────────────────────────────────────────────────────────

function SectionDivider({ label, C }: { label: string; C: Colors }) {
  return (
    <View style={divS.row}>
      <View style={[divS.line, { backgroundColor: C.border }]} />
      <Text style={[divS.label, { color: C.text4, fontFamily: C.mono }]}>{label}</Text>
      <View style={[divS.line, { backgroundColor: C.border }]} />
    </View>
  );
}

const divS = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  line:  { flex: 1, height: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 4 },
});

// ─── SettingsSheet ────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  config: TimerConfig;
  onConfigChange: (c: TimerConfig) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  keepScreenOn: boolean;
  onKeepScreenToggle: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  isTimerActive: boolean;
  clerkEnabled: boolean;
  isSignedIn: boolean;
  userInfo: ClerkUserInfo | null;
  onSignIn: () => void;
  onSignOut: () => void;
  C: Colors;
}

function SettingsSheet({
  visible, onClose,
  config, onConfigChange,
  soundEnabled, onSoundToggle,
  keepScreenOn, onKeepScreenToggle,
  theme, onThemeToggle,
  isTimerActive, clerkEnabled, isSignedIn, userInfo, onSignIn, onSignOut, C,
}: SettingsSheetProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [setRestDraft, setSetRestDraft] = useState(String(config.restBetweenSets));

  useEffect(() => {
    setSetRestDraft(String(config.restBetweenSets));
  }, [config.restBetweenSets]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      tension: 70,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [800, 0],
  });

  function changeCountdown(mode: '3-2-1' | 'single') {
    if (!isTimerActive) {
      onConfigChange(makeTimerConfig(
        config.work, config.rest, config.rounds,
        config.sets, config.restBetweenSets, mode, config.infinite,
      ));
    }
  }

  function applySetRest() {
    if (!isTimerActive) {
      const v = Math.max(0, Math.min(600, Number(setRestDraft) || 0));
      onConfigChange(makeTimerConfig(
        config.work, config.rest, config.rounds,
        config.sets, v, config.countdown, config.infinite,
      ));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={settS.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[
        settS.sheet,
        { backgroundColor: C.surface, borderTopColor: C.border2, transform: [{ translateY }] },
      ]}>
        {/* Drag handle */}
        <View style={[settS.dragHandle, { backgroundColor: C.border2 }]} />

        {/* Header */}
        <View style={[settS.header, { borderBottomColor: C.border }]}>
          <View style={settS.headerLeft}>
            <View style={[settS.headerAccent, { backgroundColor: C.accent }]} />
            <Text style={[settS.title, { color: C.text2, fontFamily: C.mono }]}>SETTINGS</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Text style={[settS.closeBtn, { color: C.text4, fontFamily: C.mono }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={settS.body} showsVerticalScrollIndicator={false}>
          {/* Account section */}
          {clerkEnabled && (
            <UserSection
              C={C}
              isSignedIn={isSignedIn}
              userInfo={userInfo}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
            />
          )}

          {/* Countdown mode */}
          <SettingsRow
            label="COUNTDOWN"
            desc={config.countdown === '3-2-1'
              ? '3-2-1: Three beeps before each work phase'
              : 'Single: One beep to start'}
            C={C}
          >
            <View style={settS.segGroup}>
              {(['3-2-1', 'single'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    settS.segBtn,
                    { borderColor: C.border2 },
                    config.countdown === mode && { backgroundColor: C.accent, borderColor: C.accent },
                  ]}
                  onPress={() => changeCountdown(mode)}
                  disabled={isTimerActive}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    settS.segText,
                    {
                      color: config.countdown === mode ? '#fff' : C.text3,
                      fontFamily: C.mono,
                      opacity: isTimerActive ? 0.5 : 1,
                    },
                  ]}>
                    {mode === '3-2-1' ? '3-2-1' : 'SINGLE'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingsRow>

          {/* SET REST (only when sets > 1) */}
          {config.sets > 1 && (
            <SettingsRow label="SET REST" desc="Rest duration between sets (seconds)" C={C}>
              <View style={settS.numWrap}>
                <TextInput
                  style={[settS.numInput, {
                    color: C.text,
                    backgroundColor: C.surface2,
                    borderColor: isTimerActive ? C.border : C.border2,
                    fontFamily: C.mono,
                    opacity: isTimerActive ? 0.5 : 1,
                  }]}
                  value={setRestDraft}
                  onChangeText={setSetRestDraft}
                  keyboardType="number-pad"
                  editable={!isTimerActive}
                  onBlur={applySetRest}
                  onSubmitEditing={applySetRest}
                />
                <Text style={[settS.numUnit, { color: C.text4, fontFamily: C.mono }]}>s</Text>
              </View>
            </SettingsRow>
          )}

          {/* Sound */}
          <SettingsRow label="SOUND" desc="Haptic cues for work, rest, and countdown" C={C}>
            <TogglePill value={soundEnabled} onToggle={onSoundToggle} C={C} />
          </SettingsRow>

          {/* Keep screen on */}
          <SettingsRow
            label="KEEP SCREEN ON"
            desc={keepScreenOn
              ? 'Screen stays on during workout'
              : 'Screen may sleep during workout'}
            C={C}
          >
            <TogglePill value={keepScreenOn} onToggle={onKeepScreenToggle} C={C} />
          </SettingsRow>

          {/* Theme */}
          <SettingsRow
            label="THEME"
            desc={theme === 'dark' ? 'Dark mode — tactical default' : 'Light mode — high visibility'}
            C={C}
          >
            <TogglePill
              value={theme === 'light'}
              onToggle={onThemeToggle}
              label={theme === 'dark' ? 'DARK' : 'LIGHT'}
              C={C}
            />
          </SettingsRow>

          {isTimerActive && (
            <Text style={[settS.activeNote, { color: C.text4, fontFamily: C.mono }]}>
              ↑ Some settings locked while timer is active
            </Text>
          )}

          <View style={{ height: 36 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const settS = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 36 : 16,
    maxHeight: '90%',
    elevation: 24,
  },
  dragHandle: {
    width: 36, height: 3,
    alignSelf: 'center',
    marginTop: 14, marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAccent: { width: 3, height: 16 },
  title:    { fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  closeBtn: { fontSize: 16 },
  body:     { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 16,
  },
  rowInfo:    { flex: 1, gap: 4 },
  rowControl: { flexShrink: 0 },
  rowLabel:   { fontSize: 12, fontWeight: '700', letterSpacing: 2.5 },
  rowDesc:    { fontSize: 11, letterSpacing: 0.3, lineHeight: 16 },
  segGroup:   { flexDirection: 'row', gap: 6 },
  segBtn: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1,
  },
  segText:    { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  numWrap:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numInput: {
    width: 64, height: 36,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  numUnit:    { fontSize: 13, letterSpacing: 0.5 },
  activeNote: { fontSize: 11, letterSpacing: 0.5, marginTop: 12, textAlign: 'center', opacity: 0.7 },
});

// ─── AppContent ───────────────────────────────────────────────────────────────

function AppContent({ clerkEnabled }: { clerkEnabled: boolean }) {
  // Theme
  const [theme, setTheme] = useState<Theme>('dark');
  const C = theme === 'dark' ? DARK : LIGHT;

  // Auth (browser-based Clerk flow — no ClerkProvider)
  const { isSignedIn, userInfo, signOut, getConvexToken } = useClerkAuth();

  // Config
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [lastDescription, setLastDescription] = useState('');

  // NL Input
  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [editingField, setEditingField] = useState<'work' | 'rest' | 'rounds' | null>(null);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [keepScreenOn, setKeepScreenOn] = useState(true);

  // Sign-in modal
  const [signInOpen, setSignInOpen] = useState(false);

  // Timer
  const audio = useAudio();
  const { state, start, pause, resume, reset } = useTimer(config, audio);
  const { phase, secondsLeft, currentRound, currentSet, totalElapsed, paused } = state;

  const phaseColor  = PHASE_COLOR[phase];
  const isRunning   = phase !== 'IDLE' && phase !== 'COMPLETE' && !paused;
  const isPaused    = paused && phase !== 'IDLE' && phase !== 'COMPLETE';
  const isComplete  = phase === 'COMPLETE';
  const isIdle      = phase === 'IDLE';
  const isTimerActive = isRunning || isPaused;
  const canParse    = !!CONVEX_URL && !isTimerActive;

  const phaseDuration =
    phase === 'WORK'              ? config.work :
    phase === 'REST'              ? config.rest :
    phase === 'REST_BETWEEN_SETS' ? config.restBetweenSets :
    phase === 'COUNTDOWN'         ? 3 : 0;
  const progress = phaseDuration > 0 ? secondsLeft / phaseDuration : 1;

  // Sync mute
  useEffect(() => { audio.setMuted(!soundEnabled); }, [soundEnabled]);

  // Keep screen awake
  useEffect(() => {
    if (keepScreenOn && isRunning) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG); };
  }, [keepScreenOn, isRunning]);

  // Phase flash
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const prevPhaseRef = useRef<TimerPhase>(phase);
  useEffect(() => {
    if (prevPhaseRef.current !== phase && phase !== 'IDLE') {
      prevPhaseRef.current = phase;
      flashOpacity.setValue(0.28);
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }).start();
    }
  }, [phase]);

  // Tick pulse on timer number
  const tickScale = useRef(new Animated.Value(1)).current;
  const prevSecondsRef = useRef(secondsLeft);
  useEffect(() => {
    if (prevSecondsRef.current !== secondsLeft && phase !== 'IDLE') {
      prevSecondsRef.current = secondsLeft;
      tickScale.setValue(1.06);
      Animated.spring(tickScale, {
        toValue: 1,
        tension: 220,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [secondsLeft, phase]);

  // Config handlers
  function handleConfig(c: TimerConfig, name?: string) {
    setConfig(c);
    reset();
    setParseError(null);
    if (name) setLastDescription(name);
  }

  // NL Parse — actions don't require auth
  async function handleParse() {
    const trimmed = inputText.trim();
    if (!trimmed || parsing) return;
    setParsing(true);
    setParseError(null);
    setParsed(null);
    setEditingField(null);
    try {
      const result = await convexCall(
        'action', 'parseWorkout:parseWorkout', { description: trimmed }
      ) as TimerConfig & { name?: string; requestedTotalSeconds?: number };
      const cfg = makeTimerConfig(
        result.work, result.rest, result.rounds,
        result.sets, result.restBetweenSets, result.countdown, result.infinite,
      );
      handleConfig(cfg, result.name || trimmed);
      setParsed({
        config: cfg,
        requestedTotalSeconds: result.requestedTotalSeconds,
        work: cfg.work, rest: cfg.rest, rounds: cfg.rounds,
        dismissedWarning: false,
      });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parse failed. Try again.');
    } finally {
      setParsing(false);
    }
  }

  // Editable chip updates
  function updateParsedField(field: 'work' | 'rest' | 'rounds', value: number) {
    if (!parsed) return;
    const next = { ...parsed, [field]: value };
    setParsed(next);
    const cfg = makeTimerConfig(
      next.work, next.rest, next.rounds,
      next.config.sets, next.config.restBetweenSets, next.config.countdown, next.config.infinite,
    );
    setConfig(cfg);
    reset();
  }

  function adjustRounds() {
    if (!parsed?.requestedTotalSeconds) return;
    const newRounds = Math.max(1, Math.min(100,
      Math.round(parsed.requestedTotalSeconds / Math.max(1, parsed.work + parsed.rest))
    ));
    const next = { ...parsed, rounds: newRounds, dismissedWarning: true };
    setParsed(next);
    const cfg = makeTimerConfig(
      next.work, next.rest, next.rounds,
      next.config.sets, next.config.restBetweenSets, next.config.countdown, next.config.infinite,
    );
    setConfig(cfg);
    reset();
  }

  const parsedTotal = parsed ? computeTotal(parsed.work, parsed.rest, parsed.rounds, parsed.config) : 0;
  const showMismatch = parsed && !parsed.dismissedWarning
    && parsed.requestedTotalSeconds != null
    && Math.abs(parsedTotal - parsed.requestedTotalSeconds) >= 3;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[S.container, { backgroundColor: C.bg }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} backgroundColor={C.bg} />

      {/* Phase flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={[S.flashOverlay, { backgroundColor: phaseColor, opacity: flashOpacity }]}
      />

      {/* Corner bracket decorations */}

      <KeyboardAvoidingView style={S.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={S.scroll}
          contentContainerStyle={[
            S.scrollContent,
            { paddingTop: Platform.OS === 'ios' ? 60 : 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Header ──────────────────────────────────────────── */}
          <View style={S.header}>
            <View style={S.brandWrap}>
              <Text style={[S.brandBracket, { color: C.border2, fontFamily: C.mono }]}>[</Text>
              <Text style={[S.brand, { color: C.text2, fontFamily: C.mono }]}>timer.ai</Text>
              <Text style={[S.brandBracket, { color: C.border2, fontFamily: C.mono }]}>]</Text>
            </View>
            <Text style={[S.tagline, { color: C.text4, fontFamily: C.mono }]}>
              {isIdle
                ? (config.infinite ? '∞' : fmtTotal(config.totalSeconds))
                : fmtElapsed(totalElapsed)}
            </Text>
            <TouchableOpacity
              onPress={() => setSettingsOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[S.gearIcon, { color: C.text4 }]}>⚙</Text>
            </TouchableOpacity>
          </View>

          {/* Header underline */}
          <View style={[S.headerLine, { backgroundColor: C.border }]} />

          {/* ── NL Input ──────────────────────────────────────── */}
          {canParse && (
            <View style={S.inputSection}>
              <View style={S.inputRow}>
                <View style={[S.inputWrap, { borderColor: C.border, backgroundColor: C.surface2 }]}>
                  <View style={[S.inputAccent, { backgroundColor: C.border2 }]} />
                  <TextInput
                    style={[S.textInput, { color: C.text, fontFamily: C.mono }]}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Describe your workout…"
                    placeholderTextColor={C.text4}
                    multiline
                    numberOfLines={2}
                    editable={!parsing}
                    returnKeyType="done"
                    onSubmitEditing={handleParse}
                  />
                </View>
                <TouchableOpacity
                  style={[S.parseBtn, {
                    borderColor: !inputText.trim() || parsing ? C.border : C.accent,
                    opacity: !inputText.trim() && !parsing ? 0.5 : 1,
                  }]}
                  onPress={handleParse}
                  disabled={!inputText.trim() || parsing}
                  activeOpacity={0.7}
                >
                  {parsing
                    ? <ActivityIndicator size="small" color={C.accent} />
                    : <Text style={[S.parseBtnText, {
                        color: !inputText.trim() ? C.text4 : C.accent,
                        fontFamily: C.mono,
                      }]}>PARSE</Text>
                  }
                </TouchableOpacity>
              </View>

              {parseError != null && (
                <View style={[S.errorWrap, { borderLeftColor: '#FF6644', backgroundColor: 'rgba(255,100,68,0.08)' }]}>
                  <Text style={[S.errorText, { color: '#FF6644', fontFamily: C.mono }]}>
                    ⚠ {parseError}
                  </Text>
                </View>
              )}

              {/* Parsed chips row */}
              {parsed && !parseError && (
                <View style={S.parsedSection}>
                  <View style={S.chipsRow}>
                    <EditableChip
                      value={parsed.work} unit="s" label="WORK"
                      editing={editingField === 'work'}
                      onTap={() => setEditingField('work')}
                      onChange={v => updateParsedField('work', v)}
                      onBlur={() => setEditingField(null)}
                      min={5} max={3600} C={C}
                    />
                    <Text style={[S.dot, { color: C.text4, fontFamily: C.mono }]}>·</Text>
                    <EditableChip
                      value={parsed.rest} unit="s" label="REST"
                      editing={editingField === 'rest'}
                      onTap={() => setEditingField('rest')}
                      onChange={v => updateParsedField('rest', v)}
                      onBlur={() => setEditingField(null)}
                      min={0} max={3600} C={C}
                    />
                    <Text style={[S.dot, { color: C.text4, fontFamily: C.mono }]}>·</Text>
                    {parsed.config.infinite
                      ? <Text style={[S.chipStatic, { color: C.text2, fontFamily: C.mono }]}>∞ LOOP</Text>
                      : (
                        <EditableChip
                          value={parsed.rounds} label="RDS"
                          editing={editingField === 'rounds'}
                          onTap={() => setEditingField('rounds')}
                          onChange={v => updateParsedField('rounds', v)}
                          onBlur={() => setEditingField(null)}
                          min={1} max={100} C={C}
                        />
                      )
                    }
                    {parsed.config.sets > 1 && (
                      <>
                        <Text style={[S.dot, { color: C.text4, fontFamily: C.mono }]}>·</Text>
                        <Text style={[S.chipStatic, { color: C.text2, fontFamily: C.mono }]}>
                          {parsed.config.sets}S
                        </Text>
                      </>
                    )}
                  </View>

                  {/* Total time */}
                  <View style={S.totalRow}>
                    <Text style={[S.totalLabel, { color: C.text4, fontFamily: C.mono }]}>TOTAL</Text>
                    <Text style={[S.totalSep,   { color: C.border2, fontFamily: C.mono }]}>·</Text>
                    <Text style={[S.totalValue,  { color: C.text3, fontFamily: C.mono }]}>
                      {parsed.config.infinite ? '∞ until stopped' : fmtTotal(parsedTotal)}
                    </Text>
                  </View>

                  {/* Mismatch warning */}
                  {showMismatch && (
                    <View style={[S.mismatch, {
                      borderColor: '#FFD600',
                      backgroundColor: 'rgba(255,214,0,0.07)',
                    }]}>
                      <Text style={[S.mismatchText, { color: '#FFD600', fontFamily: C.mono }]}>
                        ⚠ Parsed as {fmtTotal(parsedTotal)} · asked for {fmtTotal(parsed.requestedTotalSeconds!)}
                      </Text>
                      <View style={S.mismatchActions}>
                        <TouchableOpacity
                          style={[S.mismatchBtn, { borderColor: '#FFD600' }]}
                          onPress={adjustRounds}
                          activeOpacity={0.7}
                        >
                          <Text style={[S.mismatchBtnText, { color: '#FFD600', fontFamily: C.mono }]}>
                            Adjust rounds to fit {fmtTotal(parsed.requestedTotalSeconds!)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setParsed(prev => prev ? { ...prev, dismissedWarning: true } : null)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[S.mismatchDismiss, { color: C.text4, fontFamily: C.mono }]}>
                            Keep as parsed
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* No Convex hint */}
          {!CONVEX_URL && (
            <View style={[S.noConvexHint, { borderColor: C.border, backgroundColor: C.surface2 }]}>
              <View style={[S.noConvexAccent, { backgroundColor: C.border2 }]} />
              <Text style={[S.noConvexText, { color: C.text4, fontFamily: C.mono }]}>
                Set EXPO_PUBLIC_CONVEX_URL to enable AI workout parsing
              </Text>
            </View>
          )}

          {/* ── Timer ────────────────────────────────────────────── */}
          <View style={S.timerSection}>

            {/* Phase label with flanking rules */}
            <View style={S.phaseLabelRow}>
              <View style={[S.phaseRule, { backgroundColor: phaseColor }]} />
              <Text style={[S.phaseLabel, { color: phaseColor, fontFamily: C.mono }]}>
                {PHASE_LABEL[phase]}
              </Text>
              <View style={[S.phaseRule, { backgroundColor: phaseColor }]} />
            </View>

            {/* Ring + center content */}
            <View style={[S.ringWrapper, { width: RING_SIZE, height: RING_SIZE }]}>
              <TimerRing progress={progress} color={phaseColor} size={RING_SIZE} strokeWidth={7} />
              <View style={[S.ringCenter, { width: RING_SIZE, height: RING_SIZE }]}>
                <Animated.Text
                  style={[
                    S.timerNumber,
                    {
                      color: (isComplete || isRunning) ? phaseColor : C.text,
                      fontFamily: C.mono,
                      transform: [{ scale: tickScale }],
                    },
                  ] as any}
                >
                  {isIdle ? '--' : isComplete ? '✓' : String(secondsLeft)}
                </Animated.Text>

                {!isIdle && !isComplete && (
                  <Text style={[S.roundLabel, { color: C.text3, fontFamily: C.mono }]}>
                    {config.infinite
                      ? `R${currentRound}`
                      : `R${currentRound}/${config.rounds}${config.sets > 1 ? ` · S${currentSet}/${config.sets}` : ''}`}
                  </Text>
                )}
              </View>
            </View>

            {/* Config summary (idle) */}
            {isIdle && (
              <Text style={[S.configSummary, { color: C.text4, fontFamily: C.mono }]}>
                {config.work}s · {config.rest}s · {config.infinite ? '∞' : config.rounds + 'R'}
                {config.sets > 1 ? ` · ${config.sets} SETS` : ''}
              </Text>
            )}

            {/* Workout complete */}
            {isComplete && (
              <Text style={[S.completeMsg, { color: phaseColor, fontFamily: C.mono }]}>
                WORKOUT COMPLETE
              </Text>
            )}

            {/* Controls */}
            <View style={S.controls}>
              {isIdle && (
                <TouchableOpacity
                  style={[S.btnPrimary, { borderColor: phaseColor }]}
                  onPress={start}
                  activeOpacity={0.7}
                >
                  <Text style={[S.btnPrimaryText, { color: phaseColor, fontFamily: C.mono }]}>
                    START
                  </Text>
                </TouchableOpacity>
              )}
              {isRunning && (
                <TouchableOpacity
                  style={[S.btnSecondary, { borderColor: C.border2 }]}
                  onPress={pause}
                  activeOpacity={0.7}
                >
                  <Text style={[S.btnSecondaryText, { color: C.text3, fontFamily: C.mono }]}>
                    PAUSE
                  </Text>
                </TouchableOpacity>
              )}
              {isPaused && (
                <TouchableOpacity
                  style={[S.btnPrimary, { borderColor: phaseColor }]}
                  onPress={resume}
                  activeOpacity={0.7}
                >
                  <Text style={[S.btnPrimaryText, { color: phaseColor, fontFamily: C.mono }]}>
                    RESUME
                  </Text>
                </TouchableOpacity>
              )}
              {(isPaused || isComplete || isRunning) && (
                <TouchableOpacity
                  style={[S.btnGhost, { borderColor: C.border }]}
                  onPress={reset}
                  activeOpacity={0.7}
                >
                  <Text style={[S.btnGhostText, { color: C.text4, fontFamily: C.mono }]}>
                    RESET
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Presets ────────────────────────────────────────── */}
          {!!CONVEX_URL && clerkEnabled && (
            <AuthAwarePresets
              isTimerActive={isTimerActive}
              config={config}
              lastDescription={lastDescription}
              onLoad={(c, name) => handleConfig(c, name)}
              C={C}
              isSignedIn={isSignedIn}
              getConvexToken={getConvexToken}
            />
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Settings Sheet */}
      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onConfigChange={c => handleConfig(c)}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(v => !v)}
        keepScreenOn={keepScreenOn}
        onKeepScreenToggle={() => setKeepScreenOn(v => !v)}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        isTimerActive={isTimerActive}
        clerkEnabled={clerkEnabled}
        isSignedIn={isSignedIn}
        userInfo={userInfo}
        onSignIn={() => { setSettingsOpen(false); setSignInOpen(true); }}
        onSignOut={signOut}
        C={C}
      />

      {/* Sign-in modal (Clerk only) */}
      {clerkEnabled && (
        <ClerkAuthModal
          visible={signInOpen}
          onClose={() => setSignInOpen(false)}
          C={C}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────


const S = StyleSheet.create({
  flex:         { flex: 1 },
  container:    { flex: 1 },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },

  // Corner brackets

  scroll:        { flex: 1 },
  scrollContent: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 100 },

  // Header
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brandWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  brandBracket: { fontSize: 18, fontWeight: '300', opacity: 0.6 },
  brand:    { fontSize: 17, fontWeight: '700', letterSpacing: 5 },
  tagline:  { fontSize: 15, letterSpacing: 1 },
  gearIcon: { fontSize: 22 },
  headerLine: { width: '100%', height: 1, marginBottom: 20 },

  // NL Input
  inputSection: { width: '100%', gap: 10, marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 56,
  },
  inputAccent: { width: 3, alignSelf: 'stretch' },
  textInput: {
    flex: 1,
    fontSize: 15,
    padding: 12,
    textAlignVertical: 'top',
    minHeight: 56,
  },
  parseBtn: {
    width: 68,
    height: 56,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parseBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  errorWrap: {
    borderLeftWidth: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorText: { fontSize: 13, letterSpacing: 0.3 },

  // Parsed section
  parsedSection: { gap: 10, paddingTop: 2 },
  chipsRow:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  dot:       { fontSize: 16, fontWeight: '700' },
  chipStatic:{ fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  totalRow:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  totalLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  totalSep:  { fontSize: 14 },
  totalValue:{ fontSize: 14, letterSpacing: 0.5 },
  mismatch:  { borderWidth: 1, padding: 12, gap: 10 },
  mismatchText: { fontSize: 13, letterSpacing: 0.3 },
  mismatchActions: { gap: 10 },
  mismatchBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  mismatchBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  mismatchDismiss: { fontSize: 13, paddingVertical: 2 },

  // No Convex hint
  noConvexHint: {
    width: '100%',
    flexDirection: 'row',
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  noConvexAccent: { width: 3, alignSelf: 'stretch' },
  noConvexText: { flex: 1, fontSize: 12, letterSpacing: 0.5, padding: 12, lineHeight: 18 },

  // Timer
  timerSection: { width: '100%', alignItems: 'center', paddingVertical: 4 },
  phaseLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  phaseRule:  { flex: 1, height: 1, opacity: 0.35 },
  phaseLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 9,
    textTransform: 'uppercase',
    textAlign: 'center',
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
    fontSize: 96,
    fontWeight: '900',
    lineHeight: 110,
    letterSpacing: -2,
  },
  roundLabel: {
    fontSize: 15,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  configSummary: {
    fontSize: 14,
    letterSpacing: 3,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  completeMsg: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 5,
    marginTop: 14,
    textTransform: 'uppercase',
  },

  // Controls
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 30,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  btnPrimary: {
    minWidth: 110,
    height: 54,
    borderWidth: 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', letterSpacing: 5 },
  btnSecondary: {
    minWidth: 110,
    height: 54,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnSecondaryText: { fontSize: 16, fontWeight: '700', letterSpacing: 5 },
  btnGhost: {
    minWidth: 90,
    height: 54,
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnGhostText: { fontSize: 14, letterSpacing: 4 },

  // Presets
  presetsSection: { width: '100%' },
  presetsTitleRow: { marginBottom: 12, gap: 10 },
  saveBtn: {
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  presetsEmpty: {
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingVertical: 20,
    opacity: 0.7,
  },
});

// ─── Root ─────────────────────────────────────────────────────────────────────
// tokenCache imported from @clerk/expo/token-cache (uses expo-secure-store internally)

export default function App() {
  if (!CLERK_KEY) {
    return <AppContent clerkEnabled={false} />;
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <AppContent clerkEnabled={true} />
    </ClerkProvider>
  );
}
