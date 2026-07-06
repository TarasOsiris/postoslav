import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { clearSettings, getSettings, saveSettings } from '@/lib/server/settings'
import { disconnectAccount, getConnectedAccount } from '@/lib/server/account'

interface SettingsSearch {
  connected?: string
  error?: string
  error_type?: string
  error_description?: string
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    connected: search.connected ? String(search.connected) : undefined,
    error: search.error ? String(search.error) : undefined,
    error_type: search.error_type ? String(search.error_type) : undefined,
    error_description: search.error_description
      ? String(search.error_description)
      : undefined,
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
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savedReady =
    !!settings.clientKey && settings.hasSecret && !!settings.publicBaseUrl
  const hasStored =
    !!settings.clientKey || settings.hasSecret || !!settings.publicBaseUrl

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

  async function onClear() {
    if (
      !window.confirm(
        'Clear saved TikTok app credentials (client key, secret, and public base URL)? This cannot be undone.',
      )
    )
      return
    setClearing(true)
    setSaved(false)
    setError(null)
    try {
      await clearSettings()
      setClientKey('')
      setClientSecret('')
      setPublicBaseUrl('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear')
    } finally {
      setClearing(false)
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
        <Banner tone="error">
          <p className="font-display font-bold">Connection failed</p>
          <p className="mt-1 font-mono text-xs">
            {search.error}
            {search.error_type && ` · ${search.error_type}`}
          </p>
          {search.error_description && (
            <p className="mt-1 text-sm">{search.error_description}</p>
          )}
          {oauthErrorHint(search.error, search.error_type) && (
            <p className="mt-2 border-t border-white/40 pt-2 text-sm">
              {oauthErrorHint(search.error, search.error_type)}
            </p>
          )}
        </Banner>
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
          <p className="mt-1.5 text-xs text-muted">
            <span className="font-semibold text-ink">Sandbox</span> and{' '}
            <span className="font-semibold text-ink">Production</span> use
            separate keys. A Sandbox key only authorizes accounts added as{' '}
            <span className="font-semibold text-ink">Target Users</span>; a
            Production key only works after the app is approved &amp; Live.
          </p>
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
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || clearing}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {hasStored && (
            <button
              type="button"
              className="btn"
              onClick={onClear}
              disabled={saving || clearing}
            >
              {clearing ? 'Clearing…' : 'Clear settings'}
            </button>
          )}
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

/**
 * Human guidance for the OAuth errors TikTok can redirect back with. Returns
 * `null` for unrecognized errors (the raw code/type is still shown above).
 */
function oauthErrorHint(error: string, errorType?: string): string | null {
  if (error === 'unauthorized_client' || errorType === 'client_key')
    return "TikTok rejected the client key. Sandbox and Production have separate keys — a Sandbox key only works for accounts added as Target Users, and a Production key only works once your app is approved & Live. Check that the key in Settings matches the environment you're logging into."
  if (error === 'access_denied')
    return 'You declined the authorization on TikTok. Approve the requested permissions to connect.'
  if (errorType === 'scope' || error === 'scope_not_authorized')
    return 'A requested scope (user.info.basic, video.upload) is not enabled for this app. Add Login Kit + the Content Posting API to the app and try again.'
  if (errorType === 'redirect_uri' || error === 'redirect_uri')
    return 'The redirect URI must be registered in your TikTok app exactly as /api/auth/tiktok/callback on your Public base URL.'
  return null
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
