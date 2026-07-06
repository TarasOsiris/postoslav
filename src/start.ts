import {
  createStart,
  createMiddleware,
  createCsrfMiddleware,
} from '@tanstack/react-start'

// NOTE: keep this file free of `node:*` imports. `src/start.ts` is referenced
// from the client build too; a top-level node import here would leak into the
// browser bundle (the "node:path externalized" class of crash). All server-only
// work below stays inside `.server()` callbacks and uses web-standard globals
// (`atob`) plus pure JS, so nothing node-specific reaches the client.

/**
 * Paths that must stay reachable WITHOUT the operator's credentials, because
 * TikTok's servers (not the operator's browser) hit them:
 *  - `/tiktok/media/*`            — PULL_FROM_URL image fetches
 *  - `/tiktok/*.txt`, `/sb/*.txt` — domain-verification files (served from public/)
 *  - `/tiktok*.txt` (root)        — root-domain verification file (served from public/)
 *  - `/api/auth/tiktok/callback`  — the OAuth redirect back (already state-CSRF protected)
 */
const PUBLIC_PATHS = [
  /^\/tiktok\//,
  /^\/sb\//,
  /^\/tiktok[^/]*\.txt$/,
  /^\/api\/auth\/tiktok\/callback/,
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname))
}

/** Constant-time string compare (equal-length branch) to avoid leaking the token via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Extract the password from an `Authorization: Basic base64(user:pass)` header. */
function basicAuthPassword(header: string | null): string | null {
  if (!header) return null
  const [scheme, encoded] = header.split(' ')
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return null
  try {
    // "user:pass" — password may itself contain ':', so keep everything after the first.
    const decoded = atob(encoded)
    const idx = decoded.indexOf(':')
    return idx === -1 ? '' : decoded.slice(idx + 1)
  } catch {
    return null
  }
}

/**
 * Optional access gate. When `APP_ACCESS_TOKEN` is set, every request must present
 * it via HTTP Basic auth (any username; password = the token) EXCEPT the TikTok
 * callback / media / verification paths above. This keeps the app private while it
 * is exposed through a public tunnel — which it must be for TikTok to reach it —
 * so a stranger who discovers the tunnel URL can't drive the UI, read the connected
 * account, or post on the operator's behalf. When the env var is unset (the default
 * for plain localhost dev) the gate is a no-op.
 */
const accessGate = createMiddleware().server(async ({ request, pathname, next }) => {
  const token = process.env.APP_ACCESS_TOKEN
  if (!token) return next()
  if (isPublicPath(pathname)) return next()

  const supplied = basicAuthPassword(request.headers.get('authorization'))
  if (supplied !== null && safeEqual(supplied, token)) return next()

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Postoslav", charset="UTF-8"' },
  })
})

/**
 * CSRF defense for state-changing requests. Server functions are POSTs the browser
 * sends with ambient credentials (once entered, the Basic-auth header above is
 * cached and auto-attached), so without this a cross-site page could trigger a
 * post/disconnect/settings-write. Validate Origin / Sec-Fetch-Site on every non-GET
 * request that isn't one of the TikTok paths (TikTok never POSTs to us; its calls
 * are cross-site GETs that must not be rejected).
 */
const csrf = createCsrfMiddleware({
  filter: ({ request, pathname }) =>
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    !isPublicPath(pathname),
})

export const startInstance = createStart(() => ({
  requestMiddleware: [accessGate, csrf],
}))
