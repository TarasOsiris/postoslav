import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { uploadImage } from '@/lib/server/upload'
import {
  applyOverlay,
  renderOverlayPreview,
  MAX_TEXT,
} from '@/lib/server/overlay'
import type { OverlayParams } from '@/lib/server/overlay'
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
  /** Stable per-slide identity. Unique even across duplicates that share a
   *  `baseFilename`, so the tray/cover/selection can tell two copies apart. */
  id: string
  /** The original normalized upload; overlays always render from it. Shared by
   *  duplicate slides — the same source photo can appear more than once. */
  baseFilename: string
  /** The file actually posted: the base, or an overlay-burned derivative. */
  filename: string
  url: string
  width: number
  height: number
  overlay: OverlayParams | null
}

const newId = () => crypto.randomUUID()

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
  const [coverId, setCoverId] = useState<string | null>(null)
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

  // The slide the always-visible editor operates on (by stable id), plus its
  // working overlay draft and the live server-rendered preview.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OverlayParams>(DEFAULT_OVERLAY)
  const [applying, setApplying] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const selectedIndex = images.findIndex((i) => i.id === selectedId)
  const selectedImg = selectedIndex >= 0 ? images[selectedIndex] : null

  // Live preview = the real server render (same code Apply persists), debounced.
  useEffect(() => {
    const base = selectedImg?.baseFilename
    if (!base || !draft.text.trim()) {
      setRendering(false)
      return
    }
    // The already-applied file (shown via `previewSrc` on select) is byte-identical
    // to what a re-render would produce — skip the redundant server composite.
    if (selectedImg?.overlay && overlayEquals(selectedImg.overlay, draft)) {
      setRendering(false)
      return
    }
    let cancelled = false
    setRendering(true)
    const t = setTimeout(() => {
      renderOverlayPreview({ data: { baseFilename: base, ...draft } })
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
  }, [draft, selectedId])

  function select(img: Img) {
    setSelectedId(img.id)
    setDraft(img.overlay ?? DEFAULT_OVERLAY)
    // Show the applied file (or base) instantly; the live render replaces it.
    setPreviewSrc(img.overlay ? img.url : null)
    setEditError(null)
  }

  async function handleFiles(fileList: FileList | null) {
    // Only upload as many as there's room for — no point normalizing photos
    // we'd immediately discard past MAX_IMAGES.
    const room = MAX_IMAGES - images.length
    const files = (fileList ? Array.from(fileList) : [])
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, room))
    if (files.length === 0) return
    setError(null)
    setUploading(true)
    const hadSelection = selectedId !== null
    try {
      // The uploads are independent — run them together, then apply in order.
      const results = await Promise.all(
        files.map((file) => {
          const fd = new FormData()
          fd.append('file', file)
          return uploadImage({ data: fd })
        }),
      )
      const added: Array<Img> = results.map((res) => ({
        id: newId(),
        baseFilename: res.filename,
        filename: res.filename,
        url: `/tiktok/media/${res.filename}`,
        width: res.width,
        height: res.height,
        overlay: null,
      }))
      setImages((prev) => [...prev, ...added])
      setCoverId((prev) => prev ?? added[0]?.id ?? null)
      // Auto-select the first upload so the editor has something to work on.
      if (!hadSelection && added[0]) select(added[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remove(id: string) {
    const rest = images.filter((i) => i.id !== id)
    setImages(rest)
    setCoverId((prev) => (prev === id ? (rest[0]?.id ?? null) : prev))
    if (selectedId === id) {
      if (rest[0]) select(rest[0])
      else {
        setSelectedId(null)
        setPreviewSrc(null)
        setDraft(DEFAULT_OVERLAY)
      }
    }
  }

  /** Insert a copy of a slide right after it and select it. The copy shares the
   *  same source/overlaid files (same image), but a fresh id so it's an
   *  independent slide — editing one later won't touch the other. */
  function duplicate(img: Img) {
    if (images.length >= MAX_IMAGES) return
    const copy: Img = { ...img, id: newId() }
    setImages((prev) => {
      const at = prev.findIndex((p) => p.id === img.id)
      const next = [...prev]
      next.splice((at < 0 ? prev.length - 1 : at) + 1, 0, copy)
      return next
    })
    select(copy)
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

  async function saveOverlay() {
    if (!selectedImg) return
    // Empty text means "remove the overlay" — revert to the untouched base.
    if (!draft.text.trim()) {
      clearOverlay()
      return
    }
    setApplying(true)
    setEditError(null)
    try {
      const res = await applyOverlay({
        data: { baseFilename: selectedImg.baseFilename, ...draft },
      })
      setImages((prev) =>
        prev.map((i) =>
          i.id === selectedImg.id
            ? {
                ...i,
                filename: res.filename,
                url: `/tiktok/media/${res.filename}`,
                overlay: draft,
              }
            : i,
        ),
      )
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to apply text')
    } finally {
      setApplying(false)
    }
  }

  function clearOverlay() {
    if (!selectedImg) return
    setImages((prev) =>
      prev.map((i) =>
        i.id === selectedImg.id
          ? {
              ...i,
              filename: i.baseFilename,
              url: `/tiktok/media/${i.baseFilename}`,
              overlay: null,
            }
          : i,
      ),
    )
    setDraft((d) => ({ ...d, text: '' }))
    setPreviewSrc(null)
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
        images.findIndex((i) => i.id === coverId),
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
    setCoverId(null)
    setTitle('')
    setDescription('')
    setResult(null)
    setError(null)
    setSelectedId(null)
    setDraft(DEFAULT_OVERLAY)
    setPreviewSrc(null)
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

  const openPicker = () => inputRef.current?.click()
  // Shared across the empty-state hero and the tray — both accept dropped files.
  const dropZoneProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
  }

  return (
    <div className="space-y-8">
      {/* One hidden input backs every upload affordance (hero, tray, +Add). */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">New post</p>
          <h1 className="wordmark mt-1 text-4xl md:text-5xl">
            Compose carousel
          </h1>
        </div>
        {images.length > 0 && (
          <span className="badge bg-white">
            {images.length} / {MAX_IMAGES} photos
          </span>
        )}
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

      {images.length === 0 ? (
        /* ── Empty state: one clear call to action ── */
        <button
          type="button"
          onClick={openPicker}
          {...dropZoneProps}
          className={`panel flex w-full cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-16 text-center transition-colors ${
            dragOver ? 'bg-sun/30' : ''
          }`}
        >
          <div className="text-5xl">🖼️</div>
          <p className="wordmark text-2xl">
            {uploading ? 'Uploading…' : 'Start your carousel'}
          </p>
          <p className="max-w-sm text-sm text-muted">
            Drop photos here or click to upload. Any format — each is
            auto-converted to JPEG ≤1080px for TikTok. Up to {MAX_IMAGES}.
          </p>
        </button>
      ) : (
        <>
          {/* ── 1 · Edit the selected photo: preview + inline text editor ── */}
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <p className="eyebrow">Edit photo</p>
              {selectedImg && (
                <span className="badge bg-white">
                  Photo {selectedIndex + 1}
                  {selectedImg.id === coverId && ' · cover'}
                </span>
              )}
            </div>

            <div className="panel grid gap-6 p-5 md:grid-cols-2 md:p-6">
              {/* Live preview */}
              <div className="space-y-2">
                <span className="label">Preview · exactly as it posts</span>
                {selectedImg ? (
                  <div className="mx-auto w-full max-w-sm">
                    <div
                      className="relative w-full overflow-hidden border-2 border-ink bg-ink/5 shadow-[4px_4px_0_0_var(--color-ink)]"
                      style={{
                        aspectRatio: `${selectedImg.width} / ${selectedImg.height}`,
                      }}
                    >
                      <img
                        src={
                          previewSrc ??
                          `/tiktok/media/${selectedImg.baseFilename}`
                        }
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {rendering && (
                        <span className="badge absolute right-1.5 top-1.5 bg-white">
                          Rendering…
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-square items-center justify-center border-2 border-dashed border-ink/30 text-sm text-muted">
                    Select a photo below
                  </div>
                )}
              </div>

              {/* Always-inline text editor */}
              <div className="md:border-l-2 md:border-dashed md:border-ink/20 md:pl-6">
                <span className="label">Text overlay</span>
                {selectedImg ? (
                  <OverlayControls
                    draft={draft}
                    setDraft={setDraft}
                    hasOverlay={!!selectedImg.overlay}
                    applying={applying}
                    error={editError}
                    onApply={saveOverlay}
                    onClear={clearOverlay}
                  />
                ) : (
                  <p className="mt-1.5 text-sm text-muted">
                    Select a photo below to add a text overlay on top of it.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── 2 · The carousel: image tray (rows), click to edit ── */}
          <section
            {...dropZoneProps}
            className={`space-y-3 p-1 transition-colors ${
              dragOver ? 'bg-sun/30' : ''
            }`}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Your carousel</p>
                <p className="mt-0.5 text-xs text-muted">
                  Click a photo to edit · ← → reorder · ⧉ duplicate · ★ cover ·
                  ✕ remove
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={openPicker}
                disabled={uploading || images.length >= MAX_IMAGES}
              >
                {uploading ? 'Uploading…' : '+ Add photos'}
              </button>
            </div>

            <div className="grid grid-cols-3 items-start gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {images.map((img, i) => {
                const isCover = img.id === coverId
                const isSelected = img.id === selectedId
                return (
                  <div
                    key={img.id}
                    className={`panel-flat relative overflow-hidden transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-coral ring-offset-2 ring-offset-paper'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => select(img)}
                      title="Edit this photo's text"
                      className="group relative block w-full cursor-pointer"
                      style={{ aspectRatio: `${img.width} / ${img.height}` }}
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="block h-full w-full object-cover"
                      />
                      {!isSelected && (
                        <span className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/25" />
                      )}
                      <span className="badge absolute left-1 top-1 bg-white px-1.5">
                        {i + 1}
                      </span>
                      {isCover && (
                        <span className="badge absolute right-1 top-1 bg-coral px-1.5 text-white">
                          Cover
                        </span>
                      )}
                      {img.overlay && (
                        <span className="badge absolute bottom-1 left-1 bg-ink px-1.5 text-paper">
                          Aa
                        </span>
                      )}
                    </button>
                    <div className="flex flex-wrap items-center justify-center gap-1 border-t-2 border-ink bg-panel px-1 py-1">
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
                      <IconBtn
                        label="Duplicate slide"
                        disabled={images.length >= MAX_IMAGES}
                        onClick={() => duplicate(img)}
                      >
                        ⧉
                      </IconBtn>
                      <IconBtn
                        label={isCover ? 'Cover slide' : 'Set as cover'}
                        disabled={isCover}
                        onClick={() => setCoverId(img.id)}
                      >
                        ★
                      </IconBtn>
                      <IconBtn label="Remove" onClick={() => remove(img.id)}>
                        ✕
                      </IconBtn>
                    </div>
                  </div>
                )
              })}

              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="panel-flat flex aspect-square flex-col items-center justify-center gap-1 border-dashed text-muted transition-colors hover:bg-sun/30"
                >
                  <span className="text-2xl leading-none">+</span>
                  <span className="text-[0.68rem] font-medium">Add</span>
                </button>
              )}
            </div>
          </section>

          {/* ── 3 · Publish: whole-carousel details ── */}
          <section className="space-y-3">
            <p className="eyebrow">Publish</p>
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
                  className="field mt-1.5 min-h-28 resize-y"
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
          </section>

          {error && (
            <div className="panel-flat bg-coral p-3 text-sm font-medium text-white">
              {error}
            </div>
          )}

          {/* Always-reachable submit */}
          <div className="sticky bottom-3 z-20">
            <div className="panel flex items-center justify-between gap-4 p-3">
              <p className="text-sm">
                <span className="font-display font-bold">
                  {images.length} photo{images.length === 1 ? '' : 's'}
                </span>
                <span className="text-muted">
                  {' '}
                  → TikTok inbox draft
                </span>
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={post}
                disabled={posting || uploading || images.length < 1}
              >
                {posting ? 'Sending…' : 'Post carousel →'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function OverlayControls({
  draft,
  setDraft,
  hasOverlay,
  applying,
  error,
  onApply,
  onClear,
}: {
  draft: OverlayParams
  setDraft: React.Dispatch<React.SetStateAction<OverlayParams>>
  hasOverlay: boolean
  applying: boolean
  error: string | null
  onApply: () => void
  onClear: () => void
}) {
  return (
    <div className="mt-1.5 space-y-4">
      <label className="block">
        <textarea
          className="field min-h-20 resize-y"
          value={draft.text}
          maxLength={MAX_TEXT}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          placeholder="Type overlay text. Enter for a new line. Emoji welcome 🔥"
        />
        <span className="mt-1 block text-right font-mono text-[0.68rem] text-muted">
          {draft.text.length}/{MAX_TEXT}
        </span>
      </label>

      <SegGroup
        label="Position"
        options={['top', 'center', 'bottom'] as const}
        value={draft.position}
        onSelect={(position) => setDraft((d) => ({ ...d, position }))}
      />

      <SegGroup
        label="Size"
        options={['S', 'M', 'L'] as const}
        value={draft.size}
        onSelect={(size) => setDraft((d) => ({ ...d, size }))}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
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
            onChange={(e) => setDraft((d) => ({ ...d, band: e.target.checked }))}
          />
          <span className="text-sm font-medium">Band</span>
        </label>
      </div>

      {error && (
        <div className="panel-flat bg-coral p-2.5 text-sm font-medium text-white">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onApply}
          disabled={applying || !draft.text.trim()}
        >
          {applying ? 'Applying…' : 'Apply to photo'}
        </button>
        {hasOverlay && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClear}
            disabled={applying}
          >
            Remove text
          </button>
        )}
      </div>
    </div>
  )
}

/** Shallow field compare for two overlay drafts. */
function overlayEquals(a: OverlayParams, b: OverlayParams): boolean {
  return (
    a.text === b.text &&
    a.position === b.position &&
    a.color === b.color &&
    a.band === b.band &&
    a.size === b.size
  )
}

function SegGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: ReadonlyArray<T>
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((o) => (
          <Seg key={o} active={value === o} onClick={() => onSelect(o)}>
            {o}
          </Seg>
        ))}
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
