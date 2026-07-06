# Postoslav — project guide

Posts photo **carousels** to TikTok via the Content Posting API. Dashboard + Settings +
Composer. Full-stack app (needs server-side secrets, OAuth, and a DB), unlike the static
sibling projects under `../`.

**Stack:** TanStack Start (`@tanstack/react-start`, React 19, Vite) · Drizzle ORM over
better-sqlite3 · Tailwind CSS v4 (CSS-first) · TypeScript · Nitro for the prod server ·
`sharp` for image normalization.

## TanStack agent skills

TanStack packages ship `SKILL.md` guides in `node_modules` (Start, Router, Devtools, etc.),
wired in via the [intent](https://tanstack.com/ai/latest/docs/getting-started/agent-skills)
CLI. See @AGENTS.md for the loading protocol. In short: before a substantial change to
Start/Router code, run `npx @tanstack/intent@latest list` to find a matching skill, then
`npx @tanstack/intent@latest load <package>#<skill>` and follow it. Re-run
`npx @tanstack/intent@latest install` after adding/upgrading TanStack deps to refresh `AGENTS.md`.

## Commands

- `npm run dev` — Vite dev server on :3000.
- `npm run build` && `npm start` — Nitro build → `node .output/server/index.mjs`.
- `npm run db:generate` / `db:migrate` — Drizzle migrations (in `drizzle/`, committed).
- `npm run generate-routes` — regenerate `src/routeTree.gen.ts` (dev server does this automatically).
- `npx tsc --noEmit` — typecheck.

## Architecture

- **Pages / routes** (`src/routes/*.tsx`): `index.tsx` (Dashboard), `settings.tsx`, `compose.tsx`.
  Data is loaded in route `loader`s (which call server functions), mutated via server functions
  called directly from handlers, then `router.invalidate()` refreshes. (We deliberately drive data
  through loaders + server fns rather than `useQuery`, for a simple, predictable flow.)
- **Server functions** (`src/lib/server/*.ts`, `createServerFn`): `settings` (get/save + `getSettingsRow`),
  `account` (getConnected/disconnect + `upsertAccountFromToken`), `tokens` (`getValidAccessToken` refresh
  helper), `carousel` (`createCarousel`/`getPublishStatus`/`listPosts`), `upload` (`uploadImage`).
- **Server routes** (HTTP, `createFileRoute(...).server.handlers`):
  `src/routes/api/auth/tiktok/{start,callback}.ts` (OAuth) and `src/routes/tiktok/media/$file.ts`
  (serves uploaded bytes to TikTok, no redirect).
- **Global middleware** (`src/start.ts`, `createStart`): an optional Basic-auth **access gate**
  (`APP_ACCESS_TOKEN`, allowlisting the TikTok callback/media/verification paths) + `createCsrfMiddleware`
  (Origin/Sec-Fetch-Site check on non-GET). Keep `src/start.ts` free of `node:*` imports — it is
  referenced by the client build too.
- **Server-only helpers** (plain, non-`createServerFn` exports): `db-helpers.ts` (`getSettingsRow`,
  `upsertAccountFromToken`), `tokens.ts`, `media.ts` (`mediaDir()`). Never import these from client
  components — the `db`/`sharp`/`node:fs` they pull in would enter the browser bundle.
- **TikTok client** (`src/lib/tiktok.ts`): pure `fetch`, no DB — authorize URL, token exchange/refresh,
  `getUserInfo`, `initCarouselPost`, `fetchPublishStatus`.
- **DB** (`src/db/{index,schema}.ts`): tables `settings` (single row id=1), `tiktok_account`,
  `carousel_post`, `carousel_image`. SQLite file at `data/postoslav.db`.

## Key TikTok facts baked into the design

- **OAuth** (Login Kit): app has `client_key`/`client_secret` (in Settings); each account is linked via
  the OAuth flow. Scopes `user.info.basic,video.upload`. Access token 24h, refresh token 365d.
- **Images = PULL_FROM_URL only** from a **TikTok-verified HTTPS domain**. We host them at
  `publicBaseUrl + /tiktok/media/<file>` (inside the verified `/tiktok/` URL-prefix; the
  `public/tiktok/` + `public/sb/` `tiktok*.txt` files are TikTok's domain-verification tokens).
  Localhost can't be pulled — needs a tunnel. JPEG/WebP only, ≤1080p,
  ≤20MB, ≤35 images. `upload.ts` normalizes everything to JPEG ≤1080px via `sharp`.
- **Publish mode = `MEDIA_UPLOAD`** (inbox draft) → avoids the unaudited-app `SELF_ONLY` restriction;
  the user finishes publishing in the TikTok app. Endpoint `POST /v2/post/publish/content/init/` with
  `media_type: PHOTO`. Status via `POST /v2/post/publish/status/fetch/`.
- **OAuth state** is kept in-memory (`src/lib/server/oauth.ts`), not a cookie, to survive the
  localhost→tunnel domain switch during Connect.

## Conventions / gotchas

- **Path aliases**: `@/*` and `#/*` → `src/*` (both in tsconfig `paths`). Use `@/…`.
- **`verbatimModuleSyntax`** is **off** (TanStack Start's recommended default — leaving it on can defeat
  the compiler's stripping of server-only imports from the client bundle). The codebase still prefers
  `import type` / inline `type` by convention. `noUnusedLocals`/`noUnusedParameters` are on (typecheck
  fails on unused imports).
- **Tailwind v4 CSS-first**: theme tokens + component classes (`.panel`, `.btn`, `.badge`, `.field`,
  etc.) live in `src/styles.css` under `@theme` / `@layer components`. Aesthetic = risograph print-shop
  (paper bg, ink borders, hard offset shadows, coral/teal accents; Bricolage Grotesque + Hanken Grotesk).
- **Native modules** (`better-sqlite3`, `sharp`) must stay external in the build (Nitro handles this).
  Keep all `db` / `node:fs` / `node:path` / `sharp` imports inside server fn / server route modules so
  they never enter the client bundle.
- **Server-only code must live *inside* handler bodies, never at module scope.** `createServerFn` strips
  the handler closure (and imports used only by it) from the client build, but **module-scope statements
  survive** — a top-level `const X = process.env.Y ?? path.resolve('media')` in a client-imported server-fn
  module ships `node:path` to the browser and crashes it ("node:path externalized"). Read env / touch node
  built-ins lazily inside the handler (see `mediaDir()` in `src/lib/server/media.ts`).
- **Env vars** are server-only (no `VITE_` prefix): `APP_ACCESS_TOKEN` (access gate, see `src/start.ts`),
  `DATABASE_URL`, `MEDIA_DIR`. See `.env.example`.
- No test framework wired for app logic (Vitest is present from the scaffold but unused).
