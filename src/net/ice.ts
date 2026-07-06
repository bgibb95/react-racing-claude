// ICE server configuration for WebRTC.
//
// STUN lets peers discover their public address for direct connections. TURN
// relays traffic when a direct path is impossible (~⅓ of connections — symmetric
// NATs, restrictive firewalls), which is REQUIRED for players on different
// networks. Free no-signup static TURN is no longer reliable in 2026, so this
// supports, in priority order:
//
//   1. VITE_TURN_API_URL  — a REST endpoint returning a ready iceServers array
//                            (Metered / ExpressTURN "TURN credentials" URL).
//   2. VITE_TURN_URLS + VITE_TURN_USERNAME + VITE_TURN_CREDENTIAL — static creds.
//   3. Best-effort public Open Relay defaults (may fail on strict networks).
//
// See README "Custom TURN server" for how to get free credentials.

const GOOGLE_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Best-effort public fallback. Not guaranteed — provide your own for reliability.
const OPEN_RELAY_FALLBACK: RTCIceServer[] = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function parseUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Normalize a REST response into an RTCIceServer[]. Providers return either a
 *  bare array or an object with an `iceServers` field. */
function coerceIceServers(data: unknown): RTCIceServer[] | null {
  if (Array.isArray(data)) return data as RTCIceServer[];
  if (data && typeof data === 'object' && Array.isArray((data as any).iceServers)) {
    return (data as any).iceServers as RTCIceServer[];
  }
  return null;
}

async function fetchFromApi(url: string): Promise<RTCIceServer[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return coerceIceServers(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let cached: RTCIceServer[] | null = null;

/** Resolve the ICE server list (cached after first successful load). */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;

  const apiUrl = import.meta.env.VITE_TURN_API_URL;
  if (apiUrl) {
    const fromApi = await fetchFromApi(apiUrl);
    if (fromApi && fromApi.length) {
      cached = dedupeStun([...GOOGLE_STUN, ...fromApi]);
      return cached;
    }
    console.warn('[ice] VITE_TURN_API_URL returned no servers; falling back.');
  }

  const urls = parseUrls(import.meta.env.VITE_TURN_URLS);
  const user = import.meta.env.VITE_TURN_USERNAME;
  const cred = import.meta.env.VITE_TURN_CREDENTIAL;
  if (urls.length && user && cred) {
    cached = [...GOOGLE_STUN, { urls, username: user, credential: cred }];
    return cached;
  }

  // No configured TURN — best effort. Cross-network play may fail here.
  console.warn(
    '[ice] No TURN credentials configured (VITE_TURN_API_URL or VITE_TURN_*). ' +
      'Using best-effort public relay; play across different networks may fail. ' +
      'See README "Custom TURN server".',
  );
  return [...GOOGLE_STUN, ...OPEN_RELAY_FALLBACK];
}

/** True when a real (configured) TURN server is available. */
export function hasConfiguredTurn(): boolean {
  return Boolean(
    import.meta.env.VITE_TURN_API_URL ||
      (import.meta.env.VITE_TURN_URLS &&
        import.meta.env.VITE_TURN_USERNAME &&
        import.meta.env.VITE_TURN_CREDENTIAL),
  );
}

function dedupeStun(servers: RTCIceServer[]): RTCIceServer[] {
  // Drop duplicate google STUN if the API already included one.
  const seen = new Set<string>();
  return servers.filter((s) => {
    const key = JSON.stringify(s.urls);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
