import { createServerFn } from '@tanstack/react-start'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import type { OverlayOptions } from 'sharp'
import { mediaDir } from './media'

export type OverlayPosition = 'top' | 'center' | 'bottom'
export type OverlaySize = 'S' | 'M' | 'L'

export interface OverlayParams {
  text: string
  position: OverlayPosition
  color: string
  band: boolean
  size: OverlaySize
}

export interface OverlayResult {
  filename: string
  width: number
  height: number
}

const POSITIONS: ReadonlyArray<OverlayPosition> = ['top', 'center', 'bottom']
const SIZES: ReadonlyArray<OverlaySize> = ['S', 'M', 'L']
// Font size as a fraction of image width.
const SIZE_SCALE: Record<OverlaySize, number> = { S: 0.055, M: 0.075, L: 0.1 }
export const MAX_TEXT = 200

function escapeMarkup(s: string): string {
  // Escape for Pango markup. Newlines are kept (they're line breaks).
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Relative luminance (0..1) of a #rrggbb color, used to pick contrasting ink. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Normalize + validate the raw params both server fns accept. */
function parseParams(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>
  const baseFilename = path.basename(String(raw.baseFilename ?? ''))
  if (!baseFilename || baseFilename === '.')
    throw new Error('baseFilename is required')
  const text = String(raw.text ?? '').slice(0, MAX_TEXT)
  if (!text.trim()) throw new Error('Overlay text is empty')
  const position = POSITIONS.includes(raw.position as OverlayPosition)
    ? (raw.position as OverlayPosition)
    : 'top'
  const size = SIZES.includes(raw.size as OverlaySize)
    ? (raw.size as OverlaySize)
    : 'M'
  const color = /^#[0-9a-fA-F]{6}$/.test(String(raw.color))
    ? String(raw.color)
    : '#ffffff'
  const band = raw.band !== false
  return { baseFilename, text, position, size, color, band }
}

/**
 * Burn a text overlay onto the base image and return the composited JPEG bytes.
 *
 * Text is rendered with libvips' native Pango engine (NOT SVG `<text>`), which
 * is the crucial bit: Pango renders full-COLOR emoji via the system emoji font,
 * whereas the SVG/cairo path paints them as solid black blobs. Pango also does
 * the line-wrapping and centering for us, matching real font metrics.
 *
 * Legibility: an optional contrast band plus a soft shadow halo behind the text
 * (built from the text's own alpha, so it works with emoji too — Pango can't
 * stroke text directly).
 *
 * This single function backs BOTH the live preview and the persisted file, so
 * what the user sees is byte-for-byte what gets posted.
 */
async function composeOverlay(
  baseBuffer: Buffer,
  params: ReturnType<typeof parseParams>,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(baseBuffer).metadata()
  const width = meta.width ?? 1080
  const height = meta.height ?? 1080

  const fontSize = Math.round(width * SIZE_SCALE[params.size])
  const maxWidth = Math.round(width * 0.86)
  const markup = `<span foreground="${params.color}">${escapeMarkup(params.text)}</span>`

  // resolveWithObject gives us the raster dimensions from the render itself,
  // avoiding a second sharp() header parse.
  const rendered = await sharp({
    text: {
      text: markup,
      font: `sans bold ${fontSize}`,
      width: maxWidth,
      align: 'centre',
      rgba: true,
      wrap: 'word',
      spacing: Math.round(fontSize * 0.15),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })

  let textBuf = rendered.data
  let tw = rendered.info.width
  let th = rendered.info.height
  // Safety: if a lot of text overflows the image height, scale it to fit so the
  // composite can never exceed the canvas.
  if (th > height) {
    const scaled = Math.round((tw * height) / th)
    const fit = await sharp(textBuf)
      .resize(scaled, height)
      .png()
      .toBuffer({ resolveWithObject: true })
    textBuf = fit.data
    tw = fit.info.width
    th = fit.info.height
  }

  const padV = Math.round(height * 0.045)
  let top: number
  if (params.position === 'top') top = padV
  else if (params.position === 'bottom') top = height - padV - th
  else top = Math.round((height - th) / 2)
  top = Math.min(Math.max(0, top), Math.max(0, height - th))
  const left = Math.round((width - tw) / 2)

  const light = luminance(params.color) >= 0.5
  const layers: Array<OverlayOptions> = []

  if (params.band) {
    const pad = Math.round(fontSize * 0.35)
    const bandTop = Math.max(0, top - pad)
    const bandBottom = Math.min(height, top + th + pad)
    const bandFill = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,253,246,0.72)'
    const bandSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${bandTop}" width="${width}" height="${bandBottom - bandTop}" fill="${bandFill}"/></svg>`
    layers.push({ input: Buffer.from(bandSvg), top: 0, left: 0 })
  }

  // Soft shadow halo (stroke substitute): the text's own alpha, blurred, filled
  // with the contrasting ink. Two passes deepen it. Keeps light text readable on
  // busy photos even without a band, and works with color emoji.
  const strokeColor = light
    ? { r: 22, g: 19, b: 12 }
    : { r: 255, g: 253, b: 246 }
  const alpha = await sharp(textBuf)
    .extractChannel(3)
    .blur(Math.max(1, fontSize * 0.03))
    .toBuffer()
  const shadow = await sharp({
    create: { width: tw, height: th, channels: 3, background: strokeColor },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer()
  layers.push({ input: shadow, top, left })
  layers.push({ input: shadow, top, left })
  layers.push({ input: textBuf, top, left })

  const { data, info } = await sharp(baseBuffer)
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height }
}

async function readBase(baseFilename: string): Promise<Buffer> {
  const dir = mediaDir()
  await mkdir(dir, { recursive: true })
  return readFile(path.join(dir, baseFilename))
}

/**
 * Composite a text overlay onto the (already normalized) base upload and write a
 * fresh derived JPEG. Always renders from the ORIGINAL base file so repeated
 * edits never stack or degrade — the caller keeps `baseFilename` stable and
 * swaps in the returned `filename` for posting.
 */
export const applyOverlay = createServerFn({ method: 'POST' })
  .validator(parseParams)
  .handler(async ({ data }): Promise<OverlayResult> => {
    const base = await readBase(data.baseFilename)
    const { buffer, width, height } = await composeOverlay(base, data)
    const filename = `${randomUUID()}.jpg`
    await writeFile(path.join(mediaDir(), filename), buffer)
    return { filename, width, height }
  })

export interface OverlayPreview {
  dataUrl: string
  width: number
  height: number
}

/**
 * Render the overlay exactly like `applyOverlay` but return the bytes inline as
 * a data URL WITHOUT persisting a file — used for the live editor preview so
 * every keystroke doesn't orphan a JPEG. Because it shares `composeOverlay`, the
 * preview is byte-identical to what `applyOverlay` will later write.
 */
export const renderOverlayPreview = createServerFn({ method: 'POST' })
  .validator(parseParams)
  .handler(async ({ data }): Promise<OverlayPreview> => {
    const base = await readBase(data.baseFilename)
    const { buffer, width, height } = await composeOverlay(base, data)
    return {
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      width,
      height,
    }
  })
