// Server-only DB helper functions.
//
// IMPORTANT: these are plain (non-`createServerFn`) exports that touch `@/db`
// (better-sqlite3 → node:fs). They must live in a module that is NEVER imported
// by a client component, otherwise the `db` import leaks into the browser bundle
// and crashes hydration. Server functions get their handler bodies (and the
// imports only they use) stripped from the client build; plain exports do not —
// so keep helpers like these out of the client-reachable server-fn modules.
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { settings, tiktokAccount } from '@/db/schema'
import { getUserInfo } from '@/lib/tiktok'
import type { Settings } from '@/db/schema'
import type { TikTokTokenResponse } from '@/lib/tiktok'

/** Raw settings row incl. the secret — server-only, never sent to the client. */
export async function getSettingsRow(): Promise<Settings | null> {
  return (
    (await db.query.settings.findFirst({ where: eq(settings.id, 1) })) ?? null
  )
}

/**
 * Persist (or update) the connected account from a fresh token response.
 * Called from the OAuth callback route. Profile lookup is best-effort.
 */
export async function upsertAccountFromToken(
  token: TikTokTokenResponse,
): Promise<void> {
  let info: Awaited<ReturnType<typeof getUserInfo>> | undefined
  try {
    info = await getUserInfo(token.access_token)
  } catch {
    // Profile is optional — we still have the open_id and tokens.
  }

  const now = Date.now()
  const values = {
    openId: token.open_id,
    username: info?.username ?? null,
    displayName: info?.display_name ?? null,
    avatarUrl: info?.avatar_url ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now + token.refresh_expires_in * 1000),
    scope: token.scope,
  }

  await db
    .insert(tiktokAccount)
    .values(values)
    .onConflictDoUpdate({ target: tiktokAccount.openId, set: values })
}
