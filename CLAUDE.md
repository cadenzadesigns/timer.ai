# CLAUDE.md

## Commands

```bash
bun install                              # Install all workspaces
bun run dev                              # Start web dev server (apps/web)
bun run build                            # Build core + web
bun run test                             # Run core tests

# Mobile (requires native build, NOT Expo Go)
cd apps/mobile
npx expo prebuild                        # Generate ios/ and android/ (after plugin changes)
npx expo run:ios                         # Build + run on iOS simulator
npx expo run:android                     # Build + run on Android emulator

# Type checking
npx tsc --noEmit --project apps/mobile/tsconfig.json
npx tsc --noEmit --project apps/web/tsconfig.json

# Convex
cd apps/web
bunx convex dev --once                   # Deploy Convex functions
bunx convex env set ANTHROPIC_API_KEY sk-ant-...

# EAS Build (from apps/mobile)
npx eas-cli@latest build --platform ios --profile production   # App Store build
npx eas-cli@latest submit --platform ios --latest              # Submit to TestFlight
npx eas-cli@latest login                                       # Auth with Expo account

# Simulator interaction
xcrun simctl io booted screenshot /tmp/screenshot.png          # Take screenshot
xcrun simctl terminate booted com.cadenzadesigns.timerai       # Kill app
xcrun simctl launch booted com.cadenzadesigns.timerai          # Relaunch app
```

## Architecture

Bun monorepo with 3 workspaces:

- **`packages/core`** — Pure TS timer engine. Redux-style `timerReducer(state, action) → { state, audioEvents }`. Zero deps. Phases: IDLE → COUNTDOWN → WORK → REST → REST_BETWEEN_SETS → COMPLETE.
- **`apps/web`** — React 19 + Vite + Tailwind CSS v4. Uses Convex SDK directly. Clerk via `ClerkProvider` + `ConvexProviderWithClerk`.
- **`apps/mobile`** — Expo 54 + React Native 0.81. Does NOT use Convex SDK — makes direct HTTP calls to `CONVEX_URL/api/{query|mutation|action}`. Auth via Clerk native `AuthView` component (`@clerk/expo/native`).

Convex backend lives in `apps/web/convex/` but is shared by both web and mobile apps.

## Key Patterns

### Mobile Convex Integration
Mobile app calls Convex via raw `fetch()` to the HTTP API (see `convexCall()` in App.tsx), NOT the Convex React SDK. Auth tokens are passed as `Authorization: Bearer` headers.

### Mobile Auth (Clerk)
- Uses native `AuthView` from `@clerk/expo/native` (SwiftUI on iOS, Jetpack Compose on Android)
- Requires `@clerk/expo` in `app.json` plugins + `npx expo prebuild`
- `ClerkViewFactory.swift` must be in the iOS Xcode project. The `@clerk/expo` plugin often fails to inject it. Fixed by custom plugin `plugins/withClerkViewFactory.js` which copies the template and adds it to the Xcode project automatically — works for both local and EAS cloud builds.
- `navigator.onLine` polyfill at top of App.tsx prevents `clerk_offline` errors from `getToken()`

### React DOM Shims (Mobile)
`apps/mobile/shims/` provides no-op `react-dom` and `react-dom/client` modules. Required because `@clerk/expo` depends on `@clerk/clerk-js` which imports `react-dom`. Metro config redirects these imports to the shims.

### Conditional Providers
Both web and mobile apps check for env vars at startup. If `CLERK_KEY` is missing, auth is disabled. If `CONVEX_URL` is missing, NL parsing and presets are disabled. The app always works standalone.

## Environment Variables

### EAS Build (`apps/mobile/eas.json`)
Env vars are configured per-profile in `eas.json` `env` blocks. EAS project ID: `0130bdd2-92f8-4ede-b399-4c0133895380`.

### Web (`apps/web/.env.local`)
- `VITE_CONVEX_URL` — Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key

### Mobile (`apps/mobile/.env`)
- `EXPO_PUBLIC_CONVEX_URL` — Convex deployment URL
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key

### Convex (server-side)
- `ANTHROPIC_API_KEY` — For NL workout parsing

## Apple Developer

- **Team ID**: `97W7HGYXSH` (Christian Sanders, Individual)
- **Bundle ID**: `com.cadenzadesigns.timerai`
- **Capabilities**: Sign In with Apple, Associated Domains
- **EAS owner**: `cadenzadesigns` on expo.dev

## Gotchas

- **EAS Build requires interactive mode** the first time — Apple signing certs/profiles need interactive prompts. After first setup, `--non-interactive` works.
- **`expo doctor` Metro config warning is expected** — custom `watchFolders` and `resolver` for monorepo + react-dom shims trigger a warning. Not a build blocker.
- **Web + mobile UI alignment** — auth lives in the settings sheet on both platforms. Config summary uses labeled format. Presets section is collapsible.
- **`npx expo prebuild` required** after changing `app.json` plugins or native dependencies. The `ios/` and `android/` dirs are gitignored.
- **Xcode must be selected** (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`) — not just Command Line Tools. Required for simulator.
- **`as any` on Animated styles** — The one remaining `as any` cast in mobile App.tsx (Animated.Text style array) is a React Native framework limitation, not a bug.
- **Mobile App.tsx is monolithic** (~1700 lines). All components, styles, and logic in one file.
- **`postinstall` in root package.json** deduplicates nested `react`/`react-dom` copies to prevent multiple React instances.
- **Clerk JWT template** named "convex" must exist in Clerk dashboard with `{ "org_id": "{{org.id}}" }` for org-scoped presets to work.
