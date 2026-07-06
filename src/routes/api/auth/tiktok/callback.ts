import { createFileRoute } from '@tanstack/react-router'
import { getSettingsRow, upsertAccountFromToken } from '@/lib/server/db-helpers'
import { consumeOAuthState } from '@/lib/server/oauth'
import { exchangeCodeForToken } from '@/lib/tiktok'

function toSettings(query: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/settings?${query}` },
  })
}

export const Route = createFileRoute('/api/auth/tiktok/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const oauthError = url.searchParams.get('error')
        if (oauthError) {
          // Forward TikTok's richer error fields so the Settings banner can
          // explain *why* (e.g. error_type=client_key → sandbox/prod key mixup).
          const out = new URLSearchParams({ error: oauthError })
          const errorType = url.searchParams.get('error_type')
          const errorDescription = url.searchParams.get('error_description')
          if (errorType) out.set('error_type', errorType)
          if (errorDescription) out.set('error_description', errorDescription)
          return toSettings(out.toString())
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        if (!code) return toSettings('error=missing_code')
        if (!consumeOAuthState(state)) return toSettings('error=invalid_state')

        const cfg = await getSettingsRow()
        if (!cfg?.clientKey || !cfg.clientSecret || !cfg.publicBaseUrl)
          return toSettings('error=missing_settings')

        const baseUrl = cfg.publicBaseUrl.replace(/\/+$/, '')
        try {
          const token = await exchangeCodeForToken({
            clientKey: cfg.clientKey,
            clientSecret: cfg.clientSecret,
            code,
            redirectUri: `${baseUrl}/api/auth/tiktok/callback`,
          })
          await upsertAccountFromToken(token)
          return toSettings('connected=1')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'exchange_failed'
          return toSettings(`error=${encodeURIComponent(message)}`)
        }
      },
    },
  },
})
