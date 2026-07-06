import { createFileRoute } from '@tanstack/react-router'
import { getSettingsRow } from '@/lib/server/db-helpers'
import { createOAuthState } from '@/lib/server/oauth'
import { buildAuthorizeUrl } from '@/lib/tiktok'

export const Route = createFileRoute('/api/auth/tiktok/start')({
  server: {
    handlers: {
      GET: async () => {
        const cfg = await getSettingsRow()
        if (!cfg?.clientKey || !cfg.publicBaseUrl) {
          return new Response(
            'Set your Client Key and Public Base URL in Settings first.',
            { status: 400 },
          )
        }
        const baseUrl = cfg.publicBaseUrl.replace(/\/+$/, '')
        const state = createOAuthState()
        const url = buildAuthorizeUrl({
          clientKey: cfg.clientKey,
          redirectUri: `${baseUrl}/api/auth/tiktok/callback`,
          state,
        })
        return new Response(null, { status: 302, headers: { Location: url } })
      },
    },
  },
})
