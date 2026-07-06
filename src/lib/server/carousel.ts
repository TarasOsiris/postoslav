import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { carouselImage, carouselPost } from '@/db/schema'
import { getSettingsRow } from './db-helpers'
import { getValidAccessToken } from './tokens'
import { fetchPublishStatus, initCarouselPost } from '@/lib/tiktok'

export const createCarousel = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as {
      title?: unknown
      description?: unknown
      images?: unknown
      coverIndex?: unknown
    }
    const images = (Array.isArray(raw.images) ? raw.images : [])
      .map((i) =>
        i && typeof i === 'object' && 'filename' in i
          ? (i as { filename?: unknown }).filename
          : undefined,
      )
      .filter((f): f is string => typeof f === 'string')
      .map((filename) => ({ filename }))
    if (images.length < 1) throw new Error('Add at least one image')
    if (images.length > 35)
      throw new Error('TikTok carousels support up to 35 images')
    let coverIndex = Number(raw.coverIndex ?? 0)
    if (
      !Number.isInteger(coverIndex) ||
      coverIndex < 0 ||
      coverIndex >= images.length
    )
      coverIndex = 0
    return {
      title: String(raw.title ?? '').slice(0, 90),
      description: String(raw.description ?? '').slice(0, 4000),
      images,
      coverIndex,
    }
  })
  .handler(async ({ data }) => {
    const cfg = await getSettingsRow()
    if (!cfg?.publicBaseUrl)
      throw new Error(
        'Set a public base URL in Settings first — TikTok pulls images from it.',
      )
    const baseUrl = cfg.publicBaseUrl.replace(/\/+$/, '')

    // Record the draft up front so there is always a row to show/inspect.
    const [post] = await db
      .insert(carouselPost)
      .values({
        title: data.title || null,
        description: data.description || null,
        postMode: 'MEDIA_UPLOAD',
        status: 'DRAFT',
      })
      .returning()

    const imageRows = data.images.map((img, i) => ({
      postId: post.id,
      filename: img.filename,
      url: `${baseUrl}/tiktok/media/${img.filename}`,
      sortOrder: i,
      isCover: i === data.coverIndex,
    }))
    await db.insert(carouselImage).values(imageRows)

    try {
      const token = await getValidAccessToken()
      const { publishId } = await initCarouselPost({
        accessToken: token,
        title: data.title,
        description: data.description,
        photoImages: imageRows.map((r) => r.url),
        coverIndex: data.coverIndex,
        postMode: 'MEDIA_UPLOAD',
      })
      await db
        .update(carouselPost)
        .set({ publishId, status: 'PROCESSING_UPLOAD' })
        .where(eq(carouselPost.id, post.id))
      return {
        postId: post.id,
        publishId,
        status: 'PROCESSING_UPLOAD' as const,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(carouselPost)
        .set({ status: 'FAILED', failReason: message })
        .where(eq(carouselPost.id, post.id))
      throw new Error(message)
    }
  })

export const getPublishStatus = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { postId?: unknown }
    const postId = Number(raw.postId)
    if (!Number.isInteger(postId)) throw new Error('postId is required')
    return { postId }
  })
  .handler(async ({ data }) => {
    const post = await db.query.carouselPost.findFirst({
      where: eq(carouselPost.id, data.postId),
    })
    if (!post) throw new Error('Post not found')
    if (!post.publishId)
      return { status: post.status, failReason: post.failReason ?? undefined }

    const token = await getValidAccessToken()
    const res = await fetchPublishStatus({
      accessToken: token,
      publishId: post.publishId,
    })
    await db
      .update(carouselPost)
      .set({ status: res.status, failReason: res.failReason ?? null })
      .where(eq(carouselPost.id, post.id))
    return { status: res.status, failReason: res.failReason }
  })

export interface PostSummary {
  id: number
  title: string | null
  description: string | null
  status: string
  failReason: string | null
  publishId: string | null
  createdAt: number
  imageCount: number
  coverUrl: string | null
}

export const listPosts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<PostSummary>> => {
    const posts = await db.query.carouselPost.findMany({
      orderBy: (p, { desc }) => desc(p.createdAt),
      limit: 20,
    })

    const summaries: Array<PostSummary> = []
    for (const p of posts) {
      const imgs = await db.query.carouselImage.findMany({
        where: eq(carouselImage.postId, p.id),
        orderBy: (i, { asc }) => asc(i.sortOrder),
      })
      const cover = imgs.find((i) => i.isCover) ?? imgs.at(0)
      summaries.push({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        failReason: p.failReason,
        publishId: p.publishId,
        createdAt: p.createdAt.getTime(),
        imageCount: imgs.length,
        coverUrl: cover ? `/tiktok/media/${cover.filename}` : null,
      })
    }
    return summaries
  },
)
