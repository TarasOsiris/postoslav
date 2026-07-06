import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Postoslav — TikTok Carousel Press' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="wordmark px-3 py-1.5 text-sm border-2 border-transparent transition-colors hover:border-ink"
      activeProps={{
        className:
          'wordmark px-3 py-1.5 text-sm border-2 border-ink bg-ink text-paper',
      }}
    >
      {label}
    </Link>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
              <Link
                to="/"
                className="wordmark flex items-baseline gap-1.5 text-2xl"
              >
                Postoslav
                <span className="text-coral">✦</span>
              </Link>
              <nav className="flex items-center gap-1.5">
                <NavLink to="/" label="Dashboard" />
                <NavLink to="/compose" label="Compose" />
                <NavLink to="/settings" label="Settings" />
              </nav>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9">
            {children}
          </main>

          <footer className="border-t-2 border-ink">
            <div className="mx-auto max-w-6xl px-5 py-4 font-mono text-xs text-muted">
              Postoslav — posts photo carousels to TikTok via the Content
              Posting API.
            </div>
          </footer>
        </div>

        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
