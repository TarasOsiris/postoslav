import { createServerFn } from '@tanstack/react-start'
import { writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import { mediaDir } from './media'

export interface UploadResult {
  filename: string
  width: number
  height: number
}

/**
 * Accept an uploaded image (any format) and normalize it to a TikTok-friendly
 * JPEG: EXIF-rotated, downscaled to fit within 1080x1080, quality 90.
 * TikTok requires JPEG/WebP, ≤1080p, ≤20MB, and rejects PNG — normalizing here
 * means the user can drop in PNGs/large photos and it just works.
 */
export const uploadImage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!(data instanceof FormData))
      throw new Error('Expected multipart form data')
    const file = data.get('file')
    if (!(file instanceof File)) throw new Error('No file provided')
    return { file }
  })
  .handler(async ({ data }): Promise<UploadResult> => {
    const dir = mediaDir()
    await mkdir(dir, { recursive: true })
    const input = Buffer.from(await data.file.arrayBuffer())

    const { data: out, info } = await sharp(input)
      .rotate()
      .resize({
        width: 1080,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true })

    const filename = `${randomUUID()}.jpg`
    await writeFile(path.join(dir, filename), out)
    return { filename, width: info.width, height: info.height }
  })
