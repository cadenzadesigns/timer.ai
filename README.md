# timer.ai

AI-powered interval timer. Describe your workout in plain English — it gets parsed into a precise timer config. Built for the gym floor: big text, fast taps, no friction.

![timer.ai screenshot](https://placeholder.svg)

## Features

- **Natural Language Input** — Type "Tabata" or "30 on 15 off 6 rounds" and the timer configures itself via Claude AI
- **Interval Timer Engine** — Work · Rest · Sets · Rest-between-sets, fully customizable
- **Presets** — Save workouts you love, load them in one tap
- **Gym-Friendly UI** — Dark tactical aesthetic, large numbers, touch-optimized buttons
- **Audio Cues** — Distinct sounds for work-start (aggressive), rest-start (calm), countdown, workout-complete
- **Mobile PWA** — Installable on home screen, prevents screen sleep during workouts
- **Cloudflare-Ready** — Static deploy to Cloudflare Pages

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Bun workspaces |
| Timer engine | Pure TypeScript (zero deps) |
| Web UI | React 18 + Vite + Tailwind CSS v4 |
| NL parsing + presets | Convex (serverless backend) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Deploy | Cloudflare Pages |

## Project Structure

```
timer-ai/
├── packages/
│   └── core/          # Pure TS timer engine (timerReducer, types, tests)
└── apps/
    └── web/           # Vite + React web app
        ├── convex/    # Convex backend functions
        └── src/       # React components + hooks
```

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.0
- A [Convex](https://convex.dev) account (for NL parsing + presets)
- An [Anthropic](https://console.anthropic.com) API key

### Install

```bash
bun install
```

### Run (without Convex — manual config only)

```bash
bun run dev
```

### Run (with Convex — full NL parsing + presets)

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

3. **Add the Convex URL to your env:**
   ```bash
   # apps/web/.env.local
   VITE_CONVEX_URL=https://your-deployment.convex.cloud
   ```

4. **Start dev server:**
   ```bash
   bun run dev
   ```

### Test

```bash
bun run test
```

### Build

```bash
bun run build
# Output: apps/web/dist/
```

## Deploy to Cloudflare Pages

```bash
# Build
bun run build

# Deploy (requires wrangler auth)
cd apps/web
bunx wrangler pages deploy dist --project-name timer-ai
```

Or connect your GitHub repo to Cloudflare Pages with:
- **Build command:** `bun run build`
- **Build output directory:** `apps/web/dist`
- **Environment variable:** `VITE_CONVEX_URL=<your-convex-url>`

## Audio Design

| Event | Sound |
|-------|-------|
| `work-start` | Double punch square wave — aggressive, starting-gun feel |
| `rest-start` | Descending sine — calm, breathe signal |
| `countdown-3/2/1` | Ascending sine tones (330 → 440 → 550 Hz) |
| `workout-complete` | Triumphant C5-E5-G5-C6 chord |

## License

MIT
