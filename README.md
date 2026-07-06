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

## TURN server — required for cross-network play ⚠️

Playing with someone on a **different network** (e.g. a friend on their home
Wi-Fi, or you on mobile data) almost always needs a **TURN relay** — WebRTC
can't punch through symmetric NATs and strict firewalls on its own (~1/3 of
connections). The app falls back to a public relay, but **free no-signup TURN is
unreliable in 2026**, so if a join hangs and then errors with "Could not connect
across networks", set up your own free TURN — it takes ~2 minutes:

**Option A — REST endpoint (easiest).** Create a free app on
[Metered](https://dashboard.metered.ca) (50 GB/mo free), copy your *TURN
Credentials API* URL, and set:

```
# .env
VITE_TURN_API_URL=https://<yourapp>.metered.live/api/v1/turn/credentials?apiKey=xxxxxxxx
```

**Option B — static credentials** (e.g. [ExpressTURN](https://www.expressturn.com),
free 1000 GB/mo):

```
# .env
VITE_TURN_URLS=turn:relay.example.com:80,turn:relay.example.com:443,turn:relay.example.com:443?transport=tcp
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

Restart `npm run dev` after editing `.env`. For the Vercel deploy, add the same
`VITE_TURN_*` vars in **Project → Settings → Environment Variables** and redeploy.
See [.env.example](.env.example) for details.

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
