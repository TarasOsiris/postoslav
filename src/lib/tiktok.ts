/**
 * Thin, dependency-free client for the TikTok Content Posting API.
 *
 * Everything here is pure HTTP (fetch) — no DB, no framework — so it can be
 * called from server functions, server routes, or tests. Persistence and token
 * refresh live in `src/lib/server/*`.
 *
 * Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 */

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const API = 'https://open.tiktokapis.com'

/** Scopes we request: read basic profile + upload photos/videos to the inbox. */
export const TIKTOK_SCOPES = 'user.info.basic,video.upload'

export interface TikTokTokenResponse {
  access_token: string
  expires_in: number // seconds (~86400)
  refresh_token: string
  refresh_expires_in: number // seconds (~31536000)
  open_id: string
  scope: string
  token_type: string
}

export interface TikTokUserInfo {
  open_id: string
  union_id?: string
  avatar_url?: string
  display_name?: string
  username?: string
}

export type PublishStatus =
  | 'PROCESSING_DOWNLOAD'
  | 'PROCESSING_UPLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED'

/** Error thrown for any non-ok TikTok response, carrying the log_id for support. */
export class TikTokApiError extends Error {
  code: string
  logId?: string
  constructor(message: string, code: string, logId?: string) {
    super(message)
    this.name = 'TikTokApiError'
    this.code = code
    this.logId = logId
  }
}

/** Build the OAuth authorize URL the user is redirected to. */
export function buildAuthorizeUrl(opts: {
  clientKey: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_key', opts.clientKey)
  url.searchParams.set('scope', TIKTOK_SCOPES)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  return url.toString()
}

async function postToken(
  body: Record<string, string>,
): Promise<TikTokTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams(body),
  })
  const json = (await res.json()) as TikTokTokenResponse & {
    error?: string
    error_description?: string
    log_id?: string
  }
  if (json.error) {
    throw new TikTokApiError(
      json.error_description || json.error,
      json.error,
      json.log_id,
    )
  }
  return json
}

/** Exchange an authorization code for tokens. */
export function exchangeCodeForToken(opts: {
  clientKey: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<TikTokTokenResponse> {
  return postToken({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    code: opts.code,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
  })
}

/** Refresh an access token using a refresh token. */
export function refreshAccessToken(opts: {
  clientKey: string
  clientSecret: string
  refreshToken: string
}): Promise<TikTokTokenResponse> {
  return postToken({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
  })
}

/** Generic call to a Content-Posting / user endpoint that returns { data, error }. */
async function apiCall<T>(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> },
): Promise<T> {
  const url = new URL(path, API)
  for (const [k, v] of Object.entries(init?.query ?? {}))
    url.searchParams.set(k, v)

  const res = await fetch(url, {
    method: init?.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json()) as {
    data?: T
    error?: { code: string; message: string; log_id?: string }
  }
  if (json.error && json.error.code !== 'ok') {
    throw new TikTokApiError(
      json.error.message || json.error.code,
      json.error.code,
      json.error.log_id,
    )
  }
  return json.data as T
}

/** Fetch the connected creator's basic profile. */
export async function getUserInfo(
  accessToken: string,
): Promise<TikTokUserInfo> {
  const data = await apiCall<{ user: TikTokUserInfo }>(
    '/v2/user/info/',
    accessToken,
    {
      method: 'GET',
      query: { fields: 'open_id,union_id,avatar_url,display_name,username' },
    },
  )
  return data.user
}

/**
 * Initialize a photo carousel post. With post_mode MEDIA_UPLOAD the carousel is
 * sent to the creator's TikTok inbox to finish & publish inside the app.
 * `photoImages` must be HTTPS URLs on a TikTok-verified domain (PULL_FROM_URL).
 */
export async function initCarouselPost(opts: {
  accessToken: string
  title?: string
  description?: string
  photoImages: Array<string>
  coverIndex: number
  postMode?: 'MEDIA_UPLOAD' | 'DIRECT_POST'
  autoAddMusic?: boolean
}): Promise<{ publishId: string }> {
  const data = await apiCall<{ publish_id: string }>(
    '/v2/post/publish/content/init/',
    opts.accessToken,
    {
      method: 'POST',
      body: {
        media_type: 'PHOTO',
        post_mode: opts.postMode ?? 'MEDIA_UPLOAD',
        post_info: {
          title: opts.title ?? '',
          description: opts.description ?? '',
          auto_add_music: opts.autoAddMusic ?? true,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: opts.coverIndex,
          photo_images: opts.photoImages,
        },
      },
    },
  )
  return { publishId: data.publish_id }
}

/** Poll the status of a previously-initialized post. */
export async function fetchPublishStatus(opts: {
  accessToken: string
  publishId: string
}): Promise<{
  status: PublishStatus
  failReason?: string
  postIds?: Array<number>
}> {
  const data = await apiCall<{
    status: PublishStatus
    fail_reason?: string
    publicaly_available_post_id?: Array<number>
  }>('/v2/post/publish/status/fetch/', opts.accessToken, {
    method: 'POST',
    body: { publish_id: opts.publishId },
  })
  return {
    status: data.status,
    failReason: data.fail_reason || undefined,
    postIds: data.publicaly_available_post_id,
  }
}
