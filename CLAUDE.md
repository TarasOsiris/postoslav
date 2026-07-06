# Postoslav — project guide

Posts photo **carousels** to TikTok via the Content Posting API. Dashboard + Settings +
Composer. Full-stack app (needs server-side secrets, OAuth, and a DB), unlike the static
sibling projects under `../`.

**Stack:** TanStack Start (`@tanstack/react-start`, React 19, Vite) · Drizzle ORM over
better-sqlite3 · Tailwind CSS v4 (CSS-first) · TypeScript · Nitro for the prod server ·
`sharp` for image normalization.

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
  `src/routes/api/auth/tiktok/{start,callback}.ts` (OAuth) and `src/routes/media/$file.ts`
  (serves uploaded bytes to TikTok, no redirect).
- **TikTok client** (`src/lib/tiktok.ts`): pure `fetch`, no DB — authorize URL, token exchange/refresh,
  `getUserInfo`, `initCarouselPost`, `fetchPublishStatus`.
- **DB** (`src/db/{index,schema}.ts`): tables `settings` (single row id=1), `tiktok_account`,
  `carousel_post`, `carousel_image`. SQLite file at `data/postoslav.db`.

## Key TikTok facts baked into the design

- **OAuth** (Login Kit): app has `client_key`/`client_secret` (in Settings); each account is linked via
  the OAuth flow. Scopes `user.info.basic,video.upload`. Access token 24h, refresh token 365d.
- **Images = PULL_FROM_URL only** from a **TikTok-verified HTTPS domain**. We host them at
  `publicBaseUrl + /media/<file>`. Localhost can't be pulled — needs a tunnel. JPEG/WebP only, ≤1080p,
  ≤20MB, ≤35 images. `upload.ts` normalizes everything to JPEG ≤1080px via `sharp`.
- **Publish mode = `MEDIA_UPLOAD`** (inbox draft) → avoids the unaudited-app `SELF_ONLY` restriction;
  the user finishes publishing in the TikTok app. Endpoint `POST /v2/post/publish/content/init/` with
  `media_type: PHOTO`. Status via `POST /v2/post/publish/status/fetch/`.
- **OAuth state** is kept in-memory (`src/lib/server/oauth.ts`), not a cookie, to survive the
  localhost→tunnel domain switch during Connect.

## Conventions / gotchas

- **Path aliases**: `@/*` and `#/*` → `src/*` (both in tsconfig `paths`). Use `@/…`.
- **`verbatimModuleSyntax`** is on — type-only imports must use `import type` / inline `type`.
  `noUnusedLocals`/`noUnusedParameters` are on too (typecheck fails on unused imports).
- **Tailwind v4 CSS-first**: theme tokens + component classes (`.panel`, `.btn`, `.badge`, `.field`,
  etc.) live in `src/styles.css` under `@theme` / `@layer components`. Aesthetic = risograph print-shop
  (paper bg, ink borders, hard offset shadows, coral/teal accents; Bricolage Grotesque + Hanken Grotesk).
- **Native modules** (`better-sqlite3`, `sharp`) must stay external in the build (Nitro handles this).
  Keep all `db` / `node:fs` / `sharp` imports inside server fn / server route modules so they never enter
  the client bundle.
- No test framework wired for app logic (Vitest is present from the scaffold but unused).
