import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * App-level TikTok credentials + config. Single row, always id = 1.
 * `clientSecret` and OAuth tokens are stored in plaintext — acceptable for a
 * single-user local tool, but never expose this DB publicly.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(), // always 1
  clientKey: text('client_key'),
  clientSecret: text('client_secret'),
  // Public HTTPS base URL TikTok can pull images from (a verified domain / tunnel),
  // e.g. https://xxxx.trycloudflare.com — also drives the OAuth redirect_uri.
  publicBaseUrl: text('public_base_url'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
})

/** A connected TikTok account (OAuth). */
export const tiktokAccount = sqliteTable('tiktok_account', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  openId: text('open_id').notNull().unique(),
  username: text('username'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp',
  }).notNull(),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp',
  }).notNull(),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`(unixepoch())`,
  ),
})

/** A carousel (photo) post and its lifecycle. */
export const carouselPost = sqliteTable('carousel_post', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title'),
  description: text('description'),
  postMode: text('post_mode').notNull().default('MEDIA_UPLOAD'),
  publishId: text('publish_id'),
  // DRAFT | PROCESSING_DOWNLOAD | PROCESSING_UPLOAD | SEND_TO_USER_INBOX | PUBLISH_COMPLETE | FAILED
  status: text('status').notNull().default('DRAFT'),
  failReason: text('fail_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/** Uploaded images belonging to a carousel, in display order. */
export const carouselImage = sqliteTable('carousel_image', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id')
    .notNull()
    .references(() => carouselPost.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  url: text('url').notNull(), // publicBaseUrl + '/media/' + filename, resolved at post time
  sortOrder: integer('sort_order').notNull().default(0),
  isCover: integer('is_cover', { mode: 'boolean' }).notNull().default(false),
})

export type Settings = typeof settings.$inferSelect
export type TiktokAccount = typeof tiktokAccount.$inferSelect
export type CarouselPost = typeof carouselPost.$inferSelect
export type CarouselImage = typeof carouselImage.$inferSelect
