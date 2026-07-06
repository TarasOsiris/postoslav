import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getConnectedAccount } from '@/lib/server/account'
import { getPublishStatus, listPosts } from '@/lib/server/carousel'
import { getSettings } from '@/lib/server/settings'
import { StatusBadge } from '@/components/StatusBadge'
import { isPending } from '@/lib/status'
import type { AccountView } from '@/lib/server/account'
import type { PostSummary } from '@/lib/server/carousel'
import type { SettingsView } from '@/lib/server/settings'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [account, posts, settings] = await Promise.all([
      getConnectedAccount(),
      listPosts(),
      getSettings(),
    ])
    return { account, posts, settings }
  },
  component: Dashboard,
})

function Dashboard() {
  const { account, posts, settings } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)

  const configReady =
    !!settings.clientKey && settings.hasSecret && !!settings.publicBaseUrl
  const pendingCount = posts.filter((p) => isPending(p.status)).length

  async function refresh(postId: number) {
    setBusy(postId)
    try {
      await getPublishStatus({ data: { postId } })
      await router.invalidate()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="wordmark mt-1 text-4xl md:text-5xl">Dashboard</h1>
        </div>
        <Link to="/compose" className="btn btn-primary">
          ＋ New carousel
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <ConnectionCard account={account} />
        <ConfigCard settings={settings} ready={configReady} />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="wordmark text-2xl">Recent posts</h2>
          {pendingCount > 0 && (
            <span className="badge bg-sun">{pendingCount} processing</span>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="panel-flat p-8 text-center">
            <p className="font-display text-lg font-bold">No carousels yet</p>
            <p className="mt-1 text-sm text-muted">
              {configReady
                ? 'Compose your first photo carousel to send it to TikTok.'
                : 'Add your TikTok credentials in Settings, then compose a carousel.'}
            </p>
            <Link
              to={configReady ? '/compose' : '/settings'}
              className="btn btn-primary mt-5"
            >
              {configReady ? 'Compose a carousel' : 'Go to settings'}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                busy={busy === post.id}
                onRefresh={() => refresh(post.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ConnectionCard({ account }: { account: AccountView | null }) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">TikTok account</p>
      {account ? (
        <div className="mt-3 flex items-center gap-3">
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
            <p className="truncate font-display text-lg font-bold">
              {account.displayName || account.username || 'Connected'}
            </p>
            {account.username && (
              <p className="truncate font-mono text-xs text-muted">
                @{account.username}
              </p>
            )}
          </div>
          <span className="badge bg-teal ml-auto text-white">Linked</span>
        </div>
      ) : (
        <div className="mt-3">
          <p className="font-display text-lg font-bold">Not connected</p>
          <p className="mt-1 text-sm text-muted">
            Connect a TikTok account to publish carousels.
          </p>
          <Link to="/settings" className="btn btn-teal btn-sm mt-4">
            Connect in settings
          </Link>
        </div>
      )}
    </div>
  )
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 items-center justify-center border-2 border-ink text-xs font-bold ${
          ok ? 'bg-teal text-white' : 'bg-white text-muted'
        }`}
      >
        {ok ? '✓' : '·'}
      </span>
      {label}
    </li>
  )
}

function ConfigCard({
  settings,
  ready,
}: {
  settings: SettingsView
  ready: boolean
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">App configuration</p>
        <span className={`badge ${ready ? 'bg-teal text-white' : 'bg-sun'}`}>
          {ready ? 'Ready' : 'Incomplete'}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        <CheckRow ok={!!settings.clientKey} label="Client key set" />
        <CheckRow ok={settings.hasSecret} label="Client secret set" />
        <CheckRow
          ok={!!settings.publicBaseUrl}
          label="Public image base URL set"
        />
      </ul>
      <Link to="/settings" className="btn btn-sm mt-4">
        Edit settings
      </Link>
    </div>
  )
}

function PostCard({
  post,
  busy,
  onRefresh,
}: {
  post: PostSummary
  busy: boolean
  onRefresh: () => void
}) {
  return (
    <article className="panel flex flex-col overflow-hidden">
      <div className="relative aspect-square border-b-2 border-ink bg-paper">
        {post.coverUrl ? (
          <img
            src={post.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            no image
          </div>
        )}
        <span className="badge absolute left-2 top-2 bg-white">
          {post.imageCount} 🖼
        </span>
        <span className="absolute right-2 top-2">
          <StatusBadge status={post.status} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-1 font-display font-bold">
          {post.title || 'Untitled carousel'}
        </p>
        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {post.description}
          </p>
        )}
        {post.failReason && (
          <p className="mt-2 border-l-2 border-coral pl-2 text-xs text-coral">
            {post.failReason}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-mono text-[0.68rem] text-muted">
            {post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}
          </span>
          {isPending(post.status) && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onRefresh}
              disabled={busy}
            >
              {busy ? '…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
