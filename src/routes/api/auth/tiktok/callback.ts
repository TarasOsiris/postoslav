import { createFileRoute } from '@tanstack/react-router'
import { getSettingsRow } from '@/lib/server/settings'
import { consumeOAuthState } from '@/lib/server/oauth'
import { upsertAccountFromToken } from '@/lib/server/account'
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
        if (oauthError)
          return toSettings(`error=${encodeURIComponent(oauthError)}`)

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
