import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { uploadImage } from '@/lib/server/upload'
import { applyOverlay, renderOverlayPreview } from '@/lib/server/overlay'
import type {
  OverlayParams,
  OverlayPosition,
  OverlaySize,
} from '@/lib/server/overlay'
import { createCarousel } from '@/lib/server/carousel'
import { getConnectedAccount } from '@/lib/server/account'
import { getSettings } from '@/lib/server/settings'
import { StatusBadge } from '@/components/StatusBadge'

export const Route = createFileRoute('/compose')({
  loader: async () => {
    const [account, settings] = await Promise.all([
      getConnectedAccount(),
      getSettings(),
    ])
    return {
      ready: !!account && !!settings.publicBaseUrl,
      hasAccount: !!account,
      hasBaseUrl: !!settings.publicBaseUrl,
    }
  },
  component: Compose,
})

interface Img {
  /** The original normalized upload — stable id, never changes; overlays render from it. */
  baseFilename: string
  /** The file actually posted: the base, or an overlay-burned derivative. */
  filename: string
  url: string
  width: number
  height: number
  overlay: OverlayParams | null
}

const MAX_IMAGES = 35

const COLORS: Array<{ hex: string; label: string }> = [
  { hex: '#ffffff', label: 'White' },
  { hex: '#16130c', label: 'Ink' },
  { hex: '#ff4a2f', label: 'Coral' },
  { hex: '#f4b000', label: 'Sun' },
  { hex: '#0f766e', label: 'Teal' },
]

const DEFAULT_OVERLAY: OverlayParams = {
  text: '',
  position: 'top',
  color: '#ffffff',
  band: true,
  size: 'M',
}

function Compose() {
  const { ready, hasAccount, hasBaseUrl } = Route.useLoaderData()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [images, setImages] = useState<Array<Img>>([])
  const [coverFile, setCoverFile] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    postId: number
    publishId: string
    status: string
  } | null>(null)

  // Overlay editor: which image (by baseFilename) is open, plus the working draft.
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<OverlayParams>(DEFAULT_OVERLAY)
  const [applying, setApplying] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const editingImg = images.find((i) => i.baseFilename === editing) ?? null

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadImage({ data: fd })
        setImages((prev) =>
          prev.length >= MAX_IMAGES
            ? prev
            : [
                ...prev,
                {
                  baseFilename: res.filename,
                  filename: res.filename,
                  url: `/tiktok/media/${res.filename}`,
                  width: res.width,
                  height: res.height,
                  overlay: null,
                },
              ],
        )
        setCoverFile((prev) => prev ?? res.filename)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remove(baseFilename: string) {
    setImages((prev) => prev.filter((i) => i.baseFilename !== baseFilename))
    setCoverFile((prev) =>
      prev === baseFilename
        ? (images.find((i) => i.baseFilename !== baseFilename)?.baseFilename ??
          null)
        : prev,
    )
    if (editing === baseFilename) setEditing(null)
  }

  function move(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function openEditor(img: Img) {
    setEditing(img.baseFilename)
    setDraft(img.overlay ?? DEFAULT_OVERLAY)
    setEditError(null)
  }

  async function saveOverlay() {
    if (!editingImg) return
    // Empty text means "remove the overlay" — revert to the untouched base.
    if (!draft.text.trim()) {
      clearOverlay()
      return
    }
    setApplying(true)
    setEditError(null)
    try {
      const res = await applyOverlay({
        data: { baseFilename: editingImg.baseFilename, ...draft },
      })
      setImages((prev) =>
        prev.map((i) =>
          i.baseFilename === editingImg.baseFilename
            ? {
                ...i,
                filename: res.filename,
                url: `/tiktok/media/${res.filename}`,
                overlay: draft,
              }
            : i,
        ),
      )
      setEditing(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to apply text')
    } finally {
      setApplying(false)
    }
  }

  function clearOverlay() {
    if (!editingImg) return
    setImages((prev) =>
      prev.map((i) =>
        i.baseFilename === editingImg.baseFilename
          ? {
              ...i,
              filename: i.baseFilename,
              url: `/tiktok/media/${i.baseFilename}`,
              overlay: null,
            }
          : i,
      ),
    )
    setEditing(null)
  }

  async function post() {
    if (images.length < 1) {
      setError('Add at least one image.')
      return
    }
    setPosting(true)
    setError(null)
    try {
      const coverIndex = Math.max(
        0,
        images.findIndex((i) => i.baseFilename === coverFile),
      )
      const res = await createCarousel({
        data: {
          title,
          description,
          images: images.map((i) => ({ filename: i.filename })),
          coverIndex,
        },
      })
      setResult(res)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  function reset() {
    setImages([])
    setCoverFile(null)
    setTitle('')
    setDescription('')
    setResult(null)
    setError(null)
    setEditing(null)
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="panel space-y-4 p-8 text-center">
          <div className="text-5xl">📮</div>
          <h1 className="wordmark text-3xl">Carousel sent</h1>
          <div className="flex justify-center">
            <StatusBadge status={result.status} />
          </div>
          <p className="text-sm text-muted">
            Sent to your TikTok inbox as a draft. Open the TikTok app to review
            and publish. Track processing on the dashboard.
          </p>
          <p className="font-mono text-xs text-muted">
            publish_id: {result.publishId}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/" className="btn btn-primary">
              View dashboard
            </Link>
            <button type="button" className="btn" onClick={reset}>
              Compose another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">New post</p>
          <h1 className="wordmark mt-1 text-4xl md:text-5xl">
            Compose carousel
          </h1>
        </div>
        <span className="badge bg-white">
          {images.length} / {MAX_IMAGES} photos
        </span>
      </div>

      {!ready && (
        <div className="border-l-4 border-coral bg-coral/10 p-4 text-sm">
          <p className="font-display font-bold">Not ready to publish</p>
          <p className="mt-1 text-muted">
            {!hasAccount && 'Connect a TikTok account. '}
            {!hasBaseUrl && 'Set a public base URL. '}
            You can still build the carousel, but posting will fail until this
            is fixed in{' '}
            <Link
              to="/settings"
              className="underline decoration-coral decoration-2 underline-offset-2"
            >
              Settings
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Images */}
        <div className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleFiles(e.dataTransfer.files)
            }}
            className={`panel flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'bg-sun/30' : ''
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="text-3xl">🖼️</div>
            <p className="font-display font-bold">
              {uploading ? 'Uploading…' : 'Drop images or click to upload'}
            </p>
            <p className="text-xs text-muted">
              Any format — auto-converted to JPEG, ≤1080px, for TikTok.
            </p>
          </label>

          {images.length > 0 && (
            <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
              {images.map((img, i) => {
                const isCover = img.baseFilename === coverFile
                return (
                  <div
                    key={img.baseFilename}
                    className={`panel-flat relative overflow-hidden ${
                      isCover
                        ? 'ring-2 ring-coral ring-offset-2 ring-offset-paper'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openEditor(img)}
                      title="Preview & add text"
                      className="group relative block w-full cursor-pointer"
                      style={{
                        aspectRatio: `${img.width} / ${img.height}`,
                      }}
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="block h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all group-hover:bg-ink/40 group-hover:opacity-100">
                        <span className="badge bg-white">
                          {img.overlay ? 'Edit text' : 'Preview · Add text'}
                        </span>
                      </span>
                      <span className="badge absolute left-1.5 top-1.5 bg-white">
                        {i + 1}
                      </span>
                      {isCover && (
                        <span className="badge absolute right-1.5 top-1.5 bg-coral text-white">
                          Cover
                        </span>
                      )}
                      {img.overlay && (
                        <span className="badge absolute bottom-1.5 left-1.5 bg-ink text-paper">
                          Aa Text
                        </span>
                      )}
                    </button>
                    <div className="flex items-center justify-between border-t-2 border-ink bg-panel px-1 py-1">
                      <div className="flex gap-1">
                        <IconBtn
                          label="Move left"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ←
                        </IconBtn>
                        <IconBtn
                          label="Move right"
                          disabled={i === images.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          →
                        </IconBtn>
                      </div>
                      <div className="flex gap-1">
                        <IconBtn
                          label={img.overlay ? 'Edit text' : 'Add text'}
                          onClick={() => openEditor(img)}
                        >
                          Aa
                        </IconBtn>
                        {!isCover && (
                          <IconBtn
                            label="Set as cover"
                            onClick={() => setCoverFile(img.baseFilename)}
                          >
                            ★
                          </IconBtn>
                        )}
                        <IconBtn
                          label="Remove"
                          onClick={() => remove(img.baseFilename)}
                        >
                          ✕
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div className="panel space-y-5 p-6">
            <label className="block">
              <span className="label">Title</span>
              <input
                className="field mt-1.5"
                value={title}
                maxLength={90}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Carousel title"
              />
              <span className="mt-1 block text-right font-mono text-[0.68rem] text-muted">
                {title.length}/90
              </span>
            </label>

            <label className="block">
              <span className="label">Caption</span>
              <textarea
                className="field mt-1.5 min-h-32 resize-y"
                value={description}
                maxLength={4000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a caption. #hashtags and @mentions go here."
              />
              <span className="mt-1 block text-right font-mono text-[0.68rem] text-muted">
                {description.length}/4000
              </span>
            </label>
          </div>

          {error && (
            <div className="panel-flat bg-coral p-3 text-sm font-medium text-white">
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={post}
            disabled={posting || uploading || images.length < 1}
          >
            {posting ? 'Sending to TikTok…' : 'Post carousel →'}
          </button>
          <p className="text-center font-mono text-xs text-muted">
            Sends to your TikTok inbox as a draft (MEDIA_UPLOAD).
          </p>
        </div>
      </div>

      {editingImg && (
        <OverlayEditor
          key={editingImg.baseFilename}
          img={editingImg}
          draft={draft}
          setDraft={setDraft}
          applying={applying}
          error={editError}
          onApply={saveOverlay}
          onClear={clearOverlay}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function OverlayEditor({
  img,
  draft,
  setDraft,
  applying,
  error,
  onApply,
  onClear,
  onCancel,
}: {
  img: Img
  draft: OverlayParams
  setDraft: React.Dispatch<React.SetStateAction<OverlayParams>>
  applying: boolean
  error: string | null
  onApply: () => void
  onClear: () => void
  onCancel: () => void
}) {
  // The preview IS the real server render — same code that Apply persists — so
  // what's shown here is byte-for-byte what posts (emoji included). Debounced so
  // typing doesn't fire a request per keystroke.
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    img.overlay ? img.url : null,
  )
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    if (!draft.text.trim()) {
      setPreviewSrc(null)
      setRendering(false)
      return
    }
    let cancelled = false
    setRendering(true)
    const t = setTimeout(() => {
      renderOverlayPreview({
        data: { baseFilename: img.baseFilename, ...draft },
      })
        .then((res) => {
          if (!cancelled) setPreviewSrc(res.dataUrl)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRendering(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [draft, img.baseFilename])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={onCancel}
    >
      <div
        className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="eyebrow">Text overlay</p>
            <h2 className="wordmark text-2xl">Add text on image</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="btn btn-sm"
            onClick={onCancel}
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Live preview at the image's true aspect ratio (exactly how it
              appears in the carousel). The <img> is the real server render, so
              it's identical to what Apply persists. `self-start` keeps the grid
              from stretching and distorting the ratio. */}
          <div
            className="relative w-full self-start overflow-hidden border-2 border-ink bg-ink/5"
            style={{ aspectRatio: `${img.width} / ${img.height}` }}
          >
            <img
              src={previewSrc ?? `/tiktok/media/${img.baseFilename}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {rendering && (
              <span className="badge absolute right-1.5 top-1.5 bg-white">
                Rendering…
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <label className="block">
              <span className="label">Text</span>
              <textarea
                autoFocus
                className="field mt-1.5 min-h-20 resize-y"
                value={draft.text}
                maxLength={200}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, text: e.target.value }))
                }
                placeholder="Type overlay text. Enter for a new line."
              />
              <span className="mt-1 block text-right font-mono text-[0.68rem] text-muted">
                {draft.text.length}/200
              </span>
            </label>

            <div>
              <span className="label">Position</span>
              <div className="mt-1.5 flex gap-1.5">
                {(['top', 'center', 'bottom'] as Array<OverlayPosition>).map(
                  (p) => (
                    <Seg
                      key={p}
                      active={draft.position === p}
                      onClick={() => setDraft((d) => ({ ...d, position: p }))}
                    >
                      {p}
                    </Seg>
                  ),
                )}
              </div>
            </div>

            <div>
              <span className="label">Size</span>
              <div className="mt-1.5 flex gap-1.5">
                {(['S', 'M', 'L'] as Array<OverlaySize>).map((s) => (
                  <Seg
                    key={s}
                    active={draft.size === s}
                    onClick={() => setDraft((d) => ({ ...d, size: s }))}
                  >
                    {s}
                  </Seg>
                ))}
              </div>
            </div>

            <div>
              <span className="label">Color</span>
              <div className="mt-1.5 flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => setDraft((d) => ({ ...d, color: c.hex }))}
                    style={{ background: c.hex }}
                    className={`h-8 w-8 border-2 border-ink transition-transform ${
                      draft.color === c.hex
                        ? 'ring-2 ring-coral ring-offset-2 ring-offset-panel'
                        : 'hover:-translate-y-0.5'
                    }`}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-coral"
                checked={draft.band}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, band: e.target.checked }))
                }
              />
              <span className="text-sm font-medium">
                Contrast band behind text
              </span>
            </label>

            {error && (
              <div className="panel-flat bg-coral p-2.5 text-sm font-medium text-white">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onApply}
                disabled={applying}
              >
                {applying ? 'Applying…' : 'Apply text'}
              </button>
              {img.overlay && (
                <button
                  type="button"
                  className="btn"
                  onClick={onClear}
                  disabled={applying}
                >
                  Remove text
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                disabled={applying}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Seg({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-2 border-ink px-2 py-1.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
        active ? 'bg-ink text-paper' : 'bg-panel hover:bg-sun'
      }`}
    >
      {children}
    </button>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center border-2 border-ink bg-panel text-xs leading-none transition-colors hover:bg-sun disabled:opacity-30"
    >
      {children}
    </button>
  )
}
