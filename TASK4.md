# timer.ai — Voice Input + Expo Mobile App

Read the existing codebase first to understand what's built. Then implement these two features:

## Feature 1: Voice Input (Web)

Add a microphone button next to the PARSE button that lets users speak their workout description.

### Implementation:
- Use the **Web Speech API** (`webkitSpeechRecognition` / `SpeechRecognition`) — no external dependencies needed
- Add a 🎤 mic button next to the PARSE button
- When tapped:
  - Request microphone permission
  - Start listening (show a pulsing red indicator)
  - On result: populate the text input with the transcript
  - Auto-submit (parse) when speech ends
- If Web Speech API isn't available (some browsers), hide the mic button
- Mobile Safari note: Web Speech API may not be available — show a fallback message or just hide the button
- Keep the design consistent with the existing aesthetic
- The mic button should be prominent and easy to tap with sweaty gym hands (48px+ tap target)

### UX:
- Mic button pulses/glows red while listening
- Brief "Listening..." text appears
- Transcript fills the input in real-time as the user speaks
- On speech end, auto-parse after a brief delay (500ms)
- Tap mic again to cancel

## Feature 2: Expo Mobile App

Create a React Native app using Expo in `apps/mobile/`.

### Setup:
- Use `bunx create-expo-app apps/mobile --template blank-typescript`
- Add `@timer-ai/core` as a workspace dependency
- Use Expo Router for navigation (if applicable, or just single screen for now)

### Screens:
- **Single screen** (for now) that mirrors the web app functionality:
  - NL text input at top with Parse button
  - Timer display with circular progress
  - Start/Pause/Reset buttons
  - Presets list at bottom

### Key differences from web:
- Use `expo-av` for audio instead of Web Audio API
- Use `expo-speech` or `expo-speech-recognition` for voice input
- Use `expo-keep-awake` to prevent screen sleep during workouts
- Use React Native's `Animated` API for the timer ring
- Style with `StyleSheet.create()` — no Tailwind (unless using NativeWind, but keep it simple)
- Connect to the same Convex backend (use `EXPO_PUBLIC_CONVEX_URL` env var)

### Timer integration:
- Import `timerReducer`, `initialTimerState`, `makeTimerConfig` from `@timer-ai/core`
- Create a `useTimer` hook similar to the web version but using `setInterval` from React Native
- Audio: generate or bundle simple beep sounds, play via `expo-av`

### Design:
- Dark theme by default (matches web)
- Large timer number in center
- Phase-colored backgrounds (subtle tints)
- Bottom section for presets
- Follow .claude/skills/frontend-design/SKILL.md for quality

### Don't worry about:
- Auth (not yet)
- Push notifications (later)
- App Store deployment (just get it running in Expo Go)

## Technical Notes
- Use Bun for all package management
- The `packages/core` workspace package must be importable from both web and mobile
- For Expo to resolve workspace packages, you may need to configure `metro.config.js` to watch the monorepo
- Make sure `bun install` at root still works after adding the mobile app
- Test that `bun run build` in `apps/web` still works
- Don't break the existing web app

## Git
- Commit and push all changes to `origin main`

When completely finished, run:
openclaw system event --text "Done: timer.ai voice input + Expo mobile app scaffolded" --mode now
