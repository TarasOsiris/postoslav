import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Dev-only shim that serves runtime-uploaded images at `/tiktok/media/*`.
 *
 * In production the `src/routes/tiktok/media/$file` server route serves these
 * from the media dir. But under `vite dev`, a request whose path ends in a file
 * extension (`…/<uuid>.jpg`) is captured by the dev static/asset handler and
 * 404s ("Cannot GET") *before* reaching that server route — so uploaded images
 * (the compose preview, and TikTok's PULL_FROM_URL over a tunnel) break in dev
 * only. This middleware serves them straight from disk, matching prod. It reads
 * the same dir as `mediaDir()` in src/lib/server/media.ts.
 */
function serveMediaInDev(): Plugin {
  const PREFIX = '/tiktok/media/'
  return {
    name: 'postoslav:serve-media-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (req.method !== 'GET' || !pathname.startsWith(PREFIX)) return next()
        const name = path.basename(decodeURIComponent(pathname.slice(PREFIX.length)))
        if (!name) return next()
        const dir = process.env.MEDIA_DIR ?? path.resolve('media')
        readFile(path.join(dir, name)).then(
          (buf) => {
            const type = name.endsWith('.webp')
              ? 'image/webp'
              : name.endsWith('.png')
                ? 'image/png'
                : 'image/jpeg'
            res.setHeader('Content-Type', type)
            res.setHeader('Cache-Control', 'no-store')
            res.end(buf)
          },
          () => next(), // not on disk — let the normal 404 happen
        )
      })
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    // Allow reaching the dev server through a tunnel (for TikTok's OAuth
    // callback + image pulls). A leading dot allows all subdomains, so a new
    // random tunnel URL keeps working without editing this. Set to `true` to
    // allow any host.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'],
  },
  plugins: [
    devtools(),
    // Before nitro so `/tiktok/media/<uuid>.jpg` is served in dev instead of
    // being 404'd by the static/asset handler (prod uses the server route).
    serveMediaInDev(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
