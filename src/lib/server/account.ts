import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { tiktokAccount } from '@/db/schema'

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
