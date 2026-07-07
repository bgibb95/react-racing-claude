# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Apex Rivals** — a Porsche-inspired, top-down real-time multiplayer racing game. React 19 + Phaser 3 + TypeScript + Vite + Tailwind CSS v4, with PeerJS for peer-to-peer WebRTC. There is no backend or database; it deploys as a static site (Vercel). All art is generated at runtime with Phaser Graphics — nothing loaded from a CDN or asset files.

## Commands

- `npm run dev` — dev server (also accessible on the LAN — useful for testing on a phone; see `server.host: true` in `vite.config.ts`)
- `npm run build` — `tsc --noEmit` then production build to `dist/`
- `npm run typecheck` — TypeScript only, no emit
- `npm run preview` — serve the production build

There is no test suite or lint script configured in this repo.

### Local multiplayer testing

Two browser windows: host in one, join in the other with the room code. To test true cross-network behavior (the thing most likely to break), join from a phone on cellular data using the invite link, since WebRTC NAT traversal only really gets exercised across networks.

### TURN / networking config

Cross-network play requires a TURN relay (~1/3 of connections can't punch through symmetric NATs on STUN alone). Configured via `VITE_TURN_API_URL` (REST endpoint returning ICE servers) or `VITE_TURN_URLS`/`VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL` (static credentials) — see `.env.example`. Restart `npm run dev` after editing `.env`. Resolved in `src/net/ice.ts`.

## Architecture

### Networking (`src/net/`) — host-authoritative star topology

- **`PeerConnection.ts`** wraps PeerJS. The host's peer id _is_ the room code (`apexrivals-<CODE>`); `PeerConnection.host()` registers that id and accepts incoming guest `DataConnection`s, `PeerConnection.join()` connects to it. This is the entire mechanism for deciding host vs. guest — whoever calls `.host()` vs `.join()`. Exposes a typed pub/sub (`emitter.ts`) for connection lifecycle and messages.
- **`protocol.ts`** defines the wire format: compact discriminated-union messages keyed by a `t` field. Guest→host: `hello`, `ready`, `input`, `rematch`. Host→guest: `welcome`, `roster`, `race`, `snap` (carries a `WorldSnapshot`), `results`, `reject`.
- **`GameSync.ts`** is the single class that drives both roles (branches on `isHost`), implementing the `SceneSession` interface. As host: owns the authoritative roster and race lifecycle (lobby → countdown → racing → finished), buffers guest inputs, broadcasts `WorldSnapshot`s at 30Hz, detects race end (all finished, or a 25s grace period after the first finisher) and broadcasts results. As guest: sends inputs upstream, mirrors incoming state into the Zustand store.
- **`session.ts`** holds a module-level `SceneSession` singleton (`setSession`/`getSession`) because the Phaser `Track` scene is instantiated by Phaser itself and can't receive React props directly — this is how the game scene reads roster/input/race state without a direct import cycle to React.
- **`controller.ts`** is the top-level API React calls (`hostRoom`, `joinRoom`, `startRace`, `leaveRoom`). Owns the single active `GameSync` and uses a generation counter to guard against races if the user navigates away mid-connect.
- **Prediction/reconciliation** (split across `Track.ts`/`Car.ts`): the host simulates every car at full rate. Guests run the _same_ `Car.step()` physics locally for their own car each frame (client-side prediction) while sending inputs to the host at 30Hz; remote cars aren't simulated, just smoothed toward the latest snapshot (`Car.smoothToward()`, exponential lerp). When a snapshot updates the local car, `reconcileLocal()` soft-corrects small drift (<140px, 20% blend) or hard-snaps on large error / finish transitions.

### Game layer (`src/game/`) — Phaser, bridged from React

- **`PhaserGame.tsx`** mounts/tears down a fresh `Phaser.Game` (from `main.ts`) into a `<div id="game-root">` only while the race screen is active — every race gets a new Phaser instance.
- **`EventBus.ts`** is a `Phaser.Events.EventEmitter` singleton for one-off React↔Phaser signals. Continuous state instead flows through the Zustand store (Phaser → React, e.g. HUD) and through `session.ts` (React actions → Phaser reads).
- **`scenes/Boot.ts`** procedurally draws every texture at runtime (car, wheels, particles, scenery, tileable ground) via `Phaser.Graphics`, then starts `Track`.
- **`scenes/Track.ts`** is the main gameplay scene: builds circuit visuals/scenery/`Car` instances per player, and each frame branches into `hostUpdate()` (steps every car, checks collisions/progress, publishes snapshots at 30Hz) or `guestUpdate()` (predicts local car, sends input, drains snapshots, smooths remotes, reconciles). Pushes HUD scalars to the store at ~10Hz (not per-frame — keeps React re-renders cheap) and drives audio/vibration/camera effects. Reads keyboard input plus the `touchInput` singleton from `input.ts` (written by React's `TouchControls`).
- **`track/circuit.ts`** is pure math, no Phaser dependency: generates a closed-loop track via Catmull-Rom spline through hand-tuned control points, producing the dense centerline, 12 checkpoints (index 0 = start/finish), off-track distance helpers, and staggered grid slots.
- **`entities/Car.ts`** handles both kinematics (throttle/brake/steer, drag, off-track penalty, checkpoint/lap tracking, collision resolution) and visuals (sprite, wheels, brake lights, headlights, particles, skid marks). The same `step()` runs on host (all cars, authoritative) and guest (local car only, for prediction); also exposes `toState()`/`applyState()`/`smoothToward()` for the netcode.

### State (`src/state/store.ts`)

A single Zustand store shared imperatively (not just via hooks) across layers: `GameSync` and the `Track` scene both read/write it directly via `useGameStore.getState()`/`setState()` outside of React, while components subscribe via the `useGameStore` hook for reactive rendering. Notably separates high-frequency Phaser internals (per-frame physics) from the low-frequency `HudState` slice (pushed at ~10Hz) to avoid re-rendering React on every physics tick.

### React screens (`src/react/`, `src/App.tsx`)

`App.tsx` is a pure switch on `store.screen`: `Landing` → `Lobby` → `RaceScreen` → `Results`. `Landing` collects name/car color and supports `?room=CODE` invite links. `Lobby` shows roster/ready state and lap count (host-controlled). `RaceScreen` composes `PhaserGame` + `HUD` + `TouchControls` overlays. `Results` renders finishers from `store.results` and offers rematch/leave — it plays the finish fanfare via plain HTML5 Audio since the Phaser scene is already destroyed by the screen navigation.

### Shared types (`src/types.ts`)

Cross-layer contract types: `InputFrame` (seq + 4 booleans), `CarState`/`WorldSnapshot` (host broadcast payload), `Player`, `RaceResult`, `CarColor`/`CAR_COLORS` (the Porsche-inspired, trademark-free palette). Constants: `MAX_PLAYERS=4`, `DEFAULT_LAPS=3`, `ROOM_CODE_LENGTH=5`.

## Conventions

- Commit messages and PR titles follow `[EMOJI] [KEYWORD]: [Description]` (sentence case, no trailing punctuation) — see `.claude/skills/pr-and-commit-title/SKILL.md` for the emoji/keyword conventions and examples.
- Prettier is configured with `singleQuote: true` (`.prettierrc`).
