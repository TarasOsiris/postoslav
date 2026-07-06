import { randomUUID } from 'node:crypto'

/**
 * In-memory CSRF state store for the OAuth round-trip. Kept in the server
 * process (not a cookie) so it survives the localhost→tunnel domain switch that
 * happens when connecting via a public tunnel URL. Lost on restart, which just
 * means re-clicking "Connect".
 */
const pending = new Map<string, number>()
const TTL_MS = 10 * 60 * 1000

export function createOAuthState(): string {
  const state = randomUUID()
  pending.set(state, Date.now() + TTL_MS)
  return state
}

export function consumeOAuthState(state: string | null): boolean {
  const now = Date.now()
  // prune expired entries
  for (const [k, exp] of pending) if (exp < now) pending.delete(k)
  if (!state) return false
  const exp = pending.get(state)
  pending.delete(state)
  return exp !== undefined && exp > now
}
