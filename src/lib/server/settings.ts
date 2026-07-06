import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { settings } from '@/db/schema'
import type { Settings } from '@/db/schema'

export interface SettingsView {
  clientKey: string
  publicBaseUrl: string
  hasSecret: boolean
  updatedAt: number | null
}

/** Raw settings row incl. the secret — server-only, never sent to the client. */
export async function getSettingsRow(): Promise<Settings | null> {
  return (
    (await db.query.settings.findFirst({ where: eq(settings.id, 1) })) ?? null
  )
}

/** Settings for the UI, with the client secret redacted to a boolean. */
export const getSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SettingsView> => {
    const row = await getSettingsRow()
    return {
      clientKey: row?.clientKey ?? '',
      publicBaseUrl: row?.publicBaseUrl ?? '',
      hasSecret: !!row?.clientSecret,
      updatedAt: row?.updatedAt ? row.updatedAt.getTime() : null,
    }
  },
)

export const saveSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as {
      clientKey?: unknown
      clientSecret?: unknown
      publicBaseUrl?: unknown
    }
    const clientKey = String(raw.clientKey ?? '').trim()
    const publicBaseUrl = String(raw.publicBaseUrl ?? '')
      .trim()
      .replace(/\/+$/, '')
    const clientSecret = String(raw.clientSecret ?? '').trim() || undefined
    if (!clientKey) throw new Error('Client key is required')
    if (publicBaseUrl && !/^https?:\/\//i.test(publicBaseUrl))
      throw new Error('Public base URL must start with http:// or https://')
    return { clientKey, clientSecret, publicBaseUrl }
  })
  .handler(async ({ data }) => {
    const existing = await getSettingsRow()
    // Keep the existing secret if the form left it blank.
    const clientSecret = data.clientSecret ?? existing?.clientSecret ?? null
    const values = {
      id: 1,
      clientKey: data.clientKey,
      clientSecret,
      publicBaseUrl: data.publicBaseUrl,
      updatedAt: new Date(),
    }
    await db
      .insert(settings)
      .values(values)
      .onConflictDoUpdate({ target: settings.id, set: values })
    return { ok: true as const }
  })
