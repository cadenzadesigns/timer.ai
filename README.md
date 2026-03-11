# timer.ai

A natural language workout interval timer. Phase 1 & 2: monorepo skeleton + core engine + web UI.

## Structure

```
timer-ai/
├── packages/
│   └── core/          # Pure TypeScript timer engine, types, state machine
├── apps/
│   └── web/           # Vite + React + Tailwind CSS v4 timer UI
├── package.json       # Bun workspace root
└── tsconfig.base.json
```

## Getting Started

```bash
bun install
bun run dev       # Start web app dev server
bun run test      # Run core engine tests
bun run build     # Build everything
```

## Packages

### `@timer-ai/core`

Pure TypeScript timer engine with no side effects:

- **`types.ts`** — `TimerConfig`, `TimerState`, `TimerPhase`, `TimerAction`, `AudioEvent`, `TickResult`
- **`timerReducer.ts`** — Pure reducer: `(state, action) => TickResult`
- **`index.ts`** — re-exports

Phases: `IDLE → COUNTDOWN → WORK ↔ REST → REST_BETWEEN_SETS → COMPLETE`

### `apps/web`

Gym-ready timer UI:
- Hardcoded Tabata config (20s work / 10s rest / 8 rounds)
- SVG countdown ring with phase-reactive glow
- 3-2-1 countdown with Web Audio API synthesized beeps
- Phase flash transitions
- `useTimer` hook wrapping the core engine
