import { createFileRoute } from '@tanstack/react-router'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { mediaDir } from '@/lib/server/media'

/**
 * Serve an uploaded image straight from disk. Served under `/tiktok/media/` so
 * the URL sits inside the TikTok-verified URL-prefix (`<public base>/tiktok/`),
 * which PULL_FROM_URL requires. Returns bytes with no redirect.
 */
export const Route = createFileRoute('/tiktok/media/$file')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = path.basename(params.file) // guard against path traversal
        const type = name.endsWith('.webp')
          ? 'image/webp'
          : name.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'
        try {
          const buf = await readFile(path.join(mediaDir(), name))
          return new Response(new Uint8Array(buf), {
            status: 200,
            headers: {
              'Content-Type': type,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
