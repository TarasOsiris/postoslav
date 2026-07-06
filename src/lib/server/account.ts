import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { tiktokAccount } from '@/db/schema'
import { getUserInfo } from '@/lib/tiktok'
import type { TikTokTokenResponse } from '@/lib/tiktok'

export interface AccountView {
  openId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  scope: string | null
}

export const getConnectedAccount = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountView | null> => {
    const a = await db.query.tiktokAccount.findFirst()
    if (!a) return null
    return {
      openId: a.openId,
      username: a.username,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      scope: a.scope,
    }
  },
)

export const disconnectAccount = createServerFn({ method: 'POST' }).handler(
  async () => {
    await db.delete(tiktokAccount)
    return { ok: true as const }
  },
)

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
