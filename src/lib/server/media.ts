import path from 'node:path'

/**
 * Absolute directory where normalized upload JPEGs are stored and served from.
 *
 * Resolved LAZILY (inside a function, never at module scope) on purpose: this
 * module is reachable from client-imported server-fn modules (e.g. `upload.ts`,
 * pulled in by `compose.tsx`). Module-scope `process.env` / `path.resolve` calls
 * would execute in the client bundle and crash the browser
 * ("node:path externalized"). Keeping it in a function lets the Start compiler
 * strip it from the client build. See the execution-model skill.
 */
export function mediaDir(): string {
  return process.env.MEDIA_DIR ?? path.resolve('media')
}
