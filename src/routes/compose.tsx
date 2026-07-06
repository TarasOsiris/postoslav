import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { uploadImage } from '@/lib/server/upload'
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
  filename: string
  url: string
  width: number
  height: number
}

const MAX_IMAGES = 35

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
                  filename: res.filename,
                  url: `/media/${res.filename}`,
                  width: res.width,
                  height: res.height,
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

  function remove(filename: string) {
    setImages((prev) => prev.filter((i) => i.filename !== filename))
    setCoverFile((prev) =>
      prev === filename
        ? (images.find((i) => i.filename !== filename)?.filename ?? null)
        : prev,
    )
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
        images.findIndex((i) => i.filename === coverFile),
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img, i) => {
                const isCover = img.filename === coverFile
                return (
                  <div
                    key={img.filename}
                    className={`panel-flat relative overflow-hidden ${
                      isCover
                        ? 'ring-2 ring-coral ring-offset-2 ring-offset-paper'
                        : ''
                    }`}
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                    <span className="badge absolute left-1.5 top-1.5 bg-white">
                      {i + 1}
                    </span>
                    {isCover && (
                      <span className="badge absolute right-1.5 top-1.5 bg-coral text-white">
                        Cover
                      </span>
                    )}
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
                        {!isCover && (
                          <IconBtn
                            label="Set as cover"
                            onClick={() => setCoverFile(img.filename)}
                          >
                            ★
                          </IconBtn>
                        )}
                        <IconBtn
                          label="Remove"
                          onClick={() => remove(img.filename)}
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
    </div>
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
