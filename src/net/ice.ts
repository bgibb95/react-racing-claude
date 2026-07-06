// ICE server configuration for WebRTC.
//
// STUN lets peers discover their public address for direct connections.
// TURN relays traffic when a direct path is impossible (~⅓ of connections,
// e.g. symmetric NATs / restrictive firewalls) — essential for players on
// different networks. We ship free public defaults so the app works out of
// the box, and allow overriding TURN via VITE_ env vars for production.

function parseTurnUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const envUrls = parseTurnUrls(import.meta.env.VITE_TURN_URLS);
  const envUser = import.meta.env.VITE_TURN_USERNAME;
  const envCred = import.meta.env.VITE_TURN_CREDENTIAL;

  if (envUrls.length && envUser && envCred) {
    servers.push({ urls: envUrls, username: envUser, credential: envCred });
  } else {
    // Open Relay Project — free public TURN (openrelay.metered.ca).
    // Rate-limited/best-effort; provide your own for production reliability.
    servers.push(
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    );
  }

  return servers;
}
