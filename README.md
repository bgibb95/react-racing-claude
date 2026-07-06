# Apex Rivals 🏁

A Porsche-inspired, top-down **real-time multiplayer racing game** you can play with
friends anywhere — connect instantly across different networks with **peer-to-peer
WebRTC**. No downloads, no accounts, **no backend, no database**. Deploys as a static
site on Vercel.

Built with **React 19 · Phaser 3 · TypeScript · Vite · Tailwind CSS v4 · PeerJS**.

## How it works

- **Host-authoritative star topology.** One player hosts the room and runs the
  authoritative physics simulation; guests send their inputs and receive world
  snapshots (~30 Hz), with client-side prediction + smoothing to hide latency.
- **Signalling** is handled by the free PeerJS cloud broker — no server to run.
- **Cross-network / NAT traversal** via Google STUN plus a free TURN relay
  (Open Relay), so players behind symmetric NATs still connect. See below to plug in
  your own TURN server for production reliability.
- **All art is generated at runtime** (Phaser Graphics) — original, trademark-free,
  and fully self-contained (nothing loaded from a CDN).

## Play

1. `npm install`
2. `npm run dev` and open the printed URL.
3. Click **Host Race** → share the 5-letter room code (or the invite link) with friends.
4. Friends click **Join Race**, enter the code, hit **Ready**.
5. Host presses **Start Race**. First across the finish line after the set laps wins.

Controls: **Arrow keys / WASD** on desktop; on-screen pedals on touch devices.

## Local multiplayer test

Open two browser windows (or `npm run dev -- --host` and use your phone on the LAN):
host in one, join in the other with the code, and race. To verify true cross-network
play, join from a phone on **cellular** using the invite link.

## Custom TURN server (recommended for production)

The app ships with public STUN/TURN defaults that work out of the box but are
best-effort. For reliability, create a free TURN account (e.g. metered.ca) and set:

```
# .env
VITE_TURN_URLS=turn:your.turn:80,turn:your.turn:443
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

## Deploy to Vercel

Push to a Git repo and import it in Vercel (framework preset: **Vite**), or run
`vercel`. `vercel.json` adds the SPA rewrite so invite links (`?room=CODE`) and
refreshes resolve correctly. Set the `VITE_TURN_*` env vars in the Vercel project
settings for production.

## Project structure

```
src/
  net/     PeerJS wrapper, wire protocol, GameSync (host/guest netcode), ICE config
  game/    Phaser: scenes (Boot, Track), Car entity, procedural circuit, React bridge
  react/   Landing, Lobby, HUD, Results, TouchControls
  state/   Zustand store shared by React and the net/game layers
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck + production build to `dist/`
- `npm run preview` — serve the production build
- `npm run typecheck` — TypeScript only
