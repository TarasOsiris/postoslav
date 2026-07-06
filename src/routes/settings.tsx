import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSettings, saveSettings } from '@/lib/server/settings'
import { disconnectAccount, getConnectedAccount } from '@/lib/server/account'

interface SettingsSearch {
  connected?: string
  error?: string
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    connected: search.connected ? String(search.connected) : undefined,
    error: search.error ? String(search.error) : undefined,
  }),
  loader: async () => {
    const [settings, account] = await Promise.all([
      getSettings(),
      getConnectedAccount(),
    ])
    return { settings, account }
  },
  component: Settings,
})

function Settings() {
  const { settings, account } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()

  const [clientKey, setClientKey] = useState(settings.clientKey)
  const [clientSecret, setClientSecret] = useState('')
  const [publicBaseUrl, setPublicBaseUrl] = useState(settings.publicBaseUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savedReady =
    !!settings.clientKey && settings.hasSecret && !!settings.publicBaseUrl

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveSettings({
        data: {
          clientKey,
          clientSecret: clientSecret || undefined,
          publicBaseUrl,
        },
      })
      setClientSecret('')
      setSaved(true)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function onDisconnect() {
    await disconnectAccount()
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="eyebrow">Configuration</p>
        <h1 className="wordmark mt-1 text-4xl md:text-5xl">Settings</h1>
      </div>

      {search.connected && (
        <Banner tone="success">TikTok account connected. 🎉</Banner>
      )}
      {search.error && (
        <Banner tone="error">Connection failed: {search.error}</Banner>
      )}

      {/* Credentials */}
      <form onSubmit={onSave} className="panel space-y-5 p-6">
        <div>
          <p className="eyebrow">Step 1 — TikTok app credentials</p>
          <p className="mt-1 text-sm text-muted">
            From your app on{' '}
            <a
              className="underline decoration-coral decoration-2 underline-offset-2"
              href="https://developers.tiktok.com/"
              target="_blank"
              rel="noreferrer"
            >
              developers.tiktok.com
            </a>{' '}
            with the Content Posting API + Login Kit products added.
          </p>
        </div>

        <Field label="Client key">
          <input
            className="field font-mono"
            value={clientKey}
            onChange={(e) => setClientKey(e.target.value)}
            placeholder="aw1234567890abcdef"
            autoComplete="off"
          />
        </Field>

        <Field label="Client secret">
          <input
            className="field font-mono"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              settings.hasSecret
                ? '•••••••• (saved — leave blank to keep)'
                : 'client secret'
            }
            autoComplete="off"
          />
        </Field>

        <Field label="Public base URL">
          <input
            className="field font-mono"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            placeholder="https://your-tunnel.trycloudflare.com"
          />
          <p className="mt-1.5 text-xs text-muted">
            The public HTTPS origin TikTok pulls your images from. Must be a
            TikTok-verified domain — also used as the OAuth redirect base (
            <span className="font-mono">/api/auth/tiktok/callback</span>).
          </p>
        </Field>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="badge bg-teal text-white">Saved</span>}
          {error && <span className="text-sm text-coral">{error}</span>}
        </div>
      </form>

      {/* Connect */}
      <div className="panel space-y-4 p-6">
        <p className="eyebrow">Step 2 — Connect your account</p>
        {account ? (
          <div className="flex items-center gap-3">
            {account.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt=""
                className="h-12 w-12 border-2 border-ink object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center border-2 border-ink bg-teal font-display text-lg font-bold text-white">
                {(account.displayName || account.username || '?')
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-display font-bold">
                {account.displayName || account.username || 'Connected'}
              </p>
              <p className="truncate font-mono text-xs text-muted">
                scope: {account.scope || '—'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm ml-auto"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted">
              Save valid credentials first, then authorize Postoslav to post on
              your behalf.
            </p>
            {savedReady ? (
              // Full navigation (not a client route) — hits the OAuth server route.
              <a href="/api/auth/tiktok/start" className="btn btn-teal mt-4">
                Connect TikTok
              </a>
            ) : (
              <button className="btn btn-teal mt-4" disabled>
                Connect TikTok
              </button>
            )}
          </div>
        )}
      </div>

      <Callout />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Banner({
  tone,
  children,
}: {
  tone: 'success' | 'error'
  children: React.ReactNode
}) {
  return (
    <div
      className={`panel-flat p-3 text-sm font-medium ${
        tone === 'success' ? 'bg-teal text-white' : 'bg-coral text-white'
      }`}
    >
      {children}
    </div>
  )
}

function Callout() {
  return (
    <div className="border-l-4 border-ink bg-sun/40 p-4 text-sm">
      <p className="font-display font-bold">
        Heads up: images need a public home
      </p>
      <p className="mt-1 text-muted">
        TikTok fetches carousel photos from your Public base URL, so it must be
        a reachable HTTPS domain you've verified in the TikTok portal (a
        Cloudflare Tunnel / ngrok URL works). Plain{' '}
        <span className="font-mono">localhost</span> can't be reached by TikTok.
        While your app is unaudited, posts arrive as drafts in your TikTok inbox
        to finish there.
      </p>
    </div>
  )
}
