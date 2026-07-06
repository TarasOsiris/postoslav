# Postoslav ✦

A small tool to post **photo carousels** to TikTok via the official
[Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started).
It's intentionally minimal: a **Dashboard**, a **Settings** page, and a **Composer**
that uploads images and sends a carousel to your TikTok inbox as a draft.

**Stack:** TanStack Start (React 19 + Vite) · SQLite via Drizzle ORM · Tailwind CSS v4 · TypeScript.

---

## Quick start

```bash
npm install
npm run db:migrate      # create data/postoslav.db
npm run dev             # http://localhost:3000
```

Production (self-hosted Node server, via Nitro):

```bash
npm run build
npm start               # serves .output/server/index.mjs
```

## How posting works (important)

TikTok does **not** accept file uploads directly. It **pulls each image from a public
HTTPS URL** on a domain you've verified in the TikTok developer portal. This app hosts
your uploaded images at `<public base url>/media/<file>` so TikTok can fetch them.

Consequences:

- **Plain `localhost` won't work for real posting** — TikTok can't reach it. Put a
  tunnel in front (e.g. `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`)
  and use that HTTPS URL as your **Public base URL** in Settings.
- The tunnel domain must be **verified** in the TikTok portal (Manage apps → URL properties →
  add a Domain or URL-prefix property and host the verification file).
- Images are auto-normalized to **JPEG ≤1080px** on upload (TikTok rejects PNG and >1080p).
- While your app is **unaudited**, carousels are sent as **inbox drafts** (`MEDIA_UPLOAD`) —
  they land in your TikTok inbox to finish and publish inside the app. No public-post audit needed.

## One-time TikTok setup

1. Create an app at [developers.tiktok.com](https://developers.tiktok.com/).
2. Add the **Login Kit** and **Content Posting API** products.
3. Add scopes `user.info.basic` and `video.upload`.
4. Register the redirect URI: `<public base url>/api/auth/tiktok/callback`.
5. Verify your image-hosting domain (the same Public base URL) under URL properties.
6. Copy the **Client key** and **Client secret**.

## Using it

1. **Settings** → paste Client key, Client secret, and Public base URL → **Save**.
2. **Settings** → **Connect TikTok** → authorize → you're redirected back connected.
3. **Compose** → drop images, reorder, pick a cover, add a title/caption → **Post carousel**.
4. **Dashboard** → watch status; open the TikTok app to publish the draft.

## Data & files

- `data/postoslav.db` — SQLite database (gitignored).
- `media/` — uploaded, normalized JPEGs (gitignored).
- `drizzle/` — generated SQL migrations (committed).

> **Security:** the client secret and OAuth tokens are stored in plaintext in the local
> SQLite DB. Fine for a single-user local tool — don't expose the DB or run this multi-tenant.

## Scripts

| Script                           | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `npm run dev`                    | Dev server (Vite) on :3000                       |
| `npm run build` / `npm start`    | Production build / run the Nitro server          |
| `npm run db:generate`            | Generate a Drizzle migration from schema changes |
| `npm run db:migrate`             | Apply migrations                                 |
| `npm run db:studio`              | Drizzle Studio                                   |
| `npm run lint` / `npm run check` | ESLint / Prettier check                          |
