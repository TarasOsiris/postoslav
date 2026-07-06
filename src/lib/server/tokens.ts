import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { settings, tiktokAccount } from '@/db/schema'
import { refreshAccessToken } from '@/lib/tiktok'

/**
 * Return a currently-valid access token for the connected account, refreshing
 * (and persisting) it first if it is within 60s of expiry. Server-only.
 */
export async function getValidAccessToken(): Promise<string> {
  const account = await db.query.tiktokAccount.findFirst()
  if (!account)
    throw new Error('No TikTok account connected. Connect one in Settings.')

  if (account.accessTokenExpiresAt.getTime() - 60_000 > Date.now())
    return account.accessToken

  const cfg = await db.query.settings.findFirst({ where: eq(settings.id, 1) })
  if (!cfg?.clientKey || !cfg.clientSecret)
    throw new Error('Missing TikTok app credentials in Settings.')

  const token = await refreshAccessToken({
    clientKey: cfg.clientKey,
    clientSecret: cfg.clientSecret,
    refreshToken: account.refreshToken,
  })

  const now = Date.now()
  await db
    .update(tiktokAccount)
    .set({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + token.refresh_expires_in * 1000),
      scope: token.scope,
    })
    .where(eq(tiktokAccount.id, account.id))

  return token.access_token
}
