# timer.ai

AI-powered interval timer. Describe your workout in plain English — it gets parsed into a precise timer config. Built for the gym floor: big text, fast taps, no friction.

## Features

- **Natural Language Input** — Type "Tabata" or "30 on 15 off 6 rounds" and the timer configures itself via AI
- **Interval Timer Engine** — Work · Rest · Sets · Rest-between-sets, fully customizable
- **Presets** — Save workouts you love, load them in one tap (synced via Clerk auth)
- **Gym-Friendly UI** — Dark tactical aesthetic, large numbers, touch-optimized buttons
- **Audio Cues** (web) — Distinct synthesized sounds for work-start, rest-start, countdown, workout-complete
- **Haptic Feedback** (mobile) — Tactile cues for each timer phase
- **Native Mobile App** — iOS & Android via Expo with native Clerk authentication
- **Web PWA** — Installable on home screen, prevents screen sleep during workouts
- **Cloudflare-Ready** — Static deploy to Cloudflare Pages

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Bun workspaces |
| Timer engine | Pure TypeScript (zero deps) |
| Web UI | React 19 + Vite + Tailwind CSS v4 |
| Mobile | Expo 54 + React Native 0.81 |
| Auth | Clerk (native AuthView on mobile, ClerkProvider on web) |
| NL parsing + presets | Convex (serverless backend) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Deploy | Cloudflare Pages (web), EAS Build (mobile) |

## Project Structure

```
timer-ai/
├── packages/
│   └── core/            # Pure TS timer engine (timerReducer, types, tests)
└── apps/
    ├── web/             # Vite + React web app
    │   ├── convex/      # Convex backend functions (shared by web + mobile)
    │   └── src/         # React components + hooks
    └── mobile/          # Expo + React Native app
        ├── src/         # Components + hooks (TimerRing, useTimer, useAudio)
        ├── shims/       # react-dom shims for Clerk SDK compatibility
        └── App.tsx      # Main app (single-file architecture)
```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.0
- A [Convex](https://convex.dev) account (for NL parsing + presets)
- An [Anthropic](https://console.anthropic.com) API key
- A [Clerk](https://clerk.com) account (for authentication)
- [Xcode](https://developer.apple.com/xcode/) (for iOS development)

### Install

```bash
bun install
```

### Web App

#### Run (without Convex — manual config only)

```bash
bun run dev
```

#### Run (with Convex — full NL parsing + presets)

1. **Initialize Convex:**
   ```bash
   cd apps/web
   bunx convex dev --once
   # Follow the prompts → project name: timer-ai
   ```

2. **Set your Anthropic API key:**
   ```bash
   bunx convex env set ANTHROPIC_API_KEY sk-ant-...
   ```

3. **Add env vars:**
   ```bash
   # apps/web/.env.local
   VITE_CONVEX_URL=https://your-deployment.convex.cloud
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

4. **Start dev server:**
   ```bash
   bun run dev
   ```

### Mobile App

1. **Set env vars:**
   ```bash
   # apps/mobile/.env
   EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

2. **Generate native projects:**
   ```bash
   cd apps/mobile
   npx expo prebuild
   ```

3. **Run on iOS simulator:**
   ```bash
   npx expo run:ios
   ```

4. **Run on Android emulator:**
   ```bash
   npx expo run:android
   ```

The mobile app works without Clerk/Convex keys set — auth and presets are simply disabled.

### Clerk Setup

1. Create a Clerk application at [clerk.com](https://clerk.com)
2. Enable **Email** and **Google OAuth** under SSO Connections
3. Create a JWT template named **"convex"** with claim `{ "org_id": "{{org.id}}" }`
4. The `@clerk/expo` plugin in `app.json` enables native AuthView (SwiftUI on iOS, Jetpack Compose on Android)

### Test

```bash
bun run test
```

### Build

```bash
bun run build
# Output: apps/web/dist/
```

## Deploy

### Web — Cloudflare Pages

```bash
bun run build
cd apps/web
bunx wrangler pages deploy dist --project-name timer-ai
```

Or connect your GitHub repo to Cloudflare Pages with:
- **Build command:** `bun run build`
- **Build output directory:** `apps/web/dist`
- **Environment variables:** `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`

### Mobile — EAS Build

```bash
cd apps/mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Audio Design (Web)

| Event | Sound |
|-------|-------|
| `work-start` | Double punch square wave — aggressive, starting-gun feel |
| `rest-start` | Descending sine — calm, breathe signal |
| `countdown-3/2/1` | Ascending sine tones (330 → 440 → 550 Hz) |
| `workout-complete` | Triumphant C5-E5-G5-C6 chord |

The mobile app uses haptic feedback instead of audio synthesis.

## License

MIT
