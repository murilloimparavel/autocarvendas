'use client'

import { useRef, useState, type DragEvent } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { addInventoryVehiclePhoto, arrangeInventoryVehiclePhotos, removeInventoryVehiclePhoto, type InventoryVehiclePhoto } from '../actions'
import { PHOTO_ACCEPT, preparePhoto } from '../lib/preparePhoto'
import { countLabel } from '@/features/platform/lib/format'

export type PhotoTile = { id: string; url: string | null; name: string }

const fieldLabelClass = 'text-[12px] font-medium text-muted-foreground'
/** Icon pills grow to a 44px target at phone width. */
const iconPill = 'w-7 px-0 max-sm:size-11'

/** Moves one id within an ordered list; the first entry is the primary photo. */
export function reorderPhotoIds(ids: string[], id: string, to: number) {
  const from = ids.indexOf(id)
  if (from < 0 || to < 0 || to >= ids.length || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

export function VehiclePhotoEditor({
  label,
  tiles,
  busy = false,
  status,
  error,
  onAddFiles,
  onAddUrl,
  onMove,
  onRemove,
}: {
  label: string
  tiles: PhotoTile[]
  busy?: boolean
  status?: string | null
  error?: string | null
  onAddFiles: (files: File[]) => void
  onAddUrl: (url: string) => void
  /** `to` is the new index; 0 makes the photo primary. */
  onMove: (id: string, to: number) => void
  onRemove: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputId = `vehicle-photos-${label.replace(/\W+/g, '-').toLowerCase()}`

  const addUrl = () => {
    const value = url.trim()
    if (!value) return
    onAddUrl(value)
    setUrl('')
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    if (files.length) onAddFiles(files)
  }

  return (
    <div className="grid gap-2 sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className={fieldLabelClass}>{label}</label>
        <span className="text-[12px] tabular-nums text-muted-foreground">{tiles.length ? `${tiles.length} ${tiles.length === 1 ? 'photo' : 'photos'}` : 'No photos'}</span>
      </div>
      <div
        onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`grid gap-3 rounded-md border border-dashed p-2 ${dragging ? 'border-foreground bg-muted' : ''}`}
      >
        {tiles.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-3">
            {tiles.map((tile, index) => (
              <li key={tile.id} className="flex min-w-0 items-center overflow-hidden rounded-[4px] border bg-card sm:block">
                <div className="relative aspect-[4/3] w-24 shrink-0 bg-muted sm:w-auto">
                  {tile.url
                    ? <Image src={tile.url} alt={tile.name} fill unoptimized sizes="200px" className="object-contain" />
                    : <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">No preview</span>}
                  {index === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded-[2px] bg-foreground px-1.5 py-px text-[11px] font-medium text-background">Primary</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1 p-1.5">
                  <p className="w-full truncate px-1 text-center text-xs text-muted-foreground" title={tile.name}>{tile.name}</p>
                  <Track>
                    <Pill size="sm" variant="plain" className={iconPill} aria-label={`Move ${tile.name} earlier`} disabled={busy || index === 0} onClick={() => onMove(tile.id, index - 1)}>
                      <ChevronLeft />
                    </Pill>
                    <Pill size="sm" variant="plain" className={iconPill} aria-label={`Move ${tile.name} later`} disabled={busy || index === tiles.length - 1} onClick={() => onMove(tile.id, index + 1)}>
                      <ChevronRight />
                    </Pill>
                    <Pill size="sm" variant="plain" className={iconPill} aria-label={`Make ${tile.name} primary`} disabled={busy || index === 0} onClick={() => onMove(tile.id, 0)}>
                      <Star />
                    </Pill>
                    <Pill size="sm" variant="plain" className={iconPill} aria-label={`Remove ${tile.name}`} disabled={busy} onClick={() => onRemove(tile.id)}>
                      <Trash2 />
                    </Pill>
                  </Track>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          className="sr-only"
          disabled={busy}
          onChange={event => {
            const files = Array.from(event.target.files || [])
            event.target.value = ''
            if (files.length) onAddFiles(files)
          }}
        />
        {/* Stacked at every width: inside a dialog the row is too narrow to share with the URL field. */}
        <div className="flex min-w-0 flex-col gap-2">
          <Track className="self-start">
            <Pill className="max-sm:h-11" disabled={busy} onClick={() => inputRef.current?.click()}>
              <ImagePlus /> {tiles.length ? 'Add more photos' : 'Add photos'}
            </Pill>
          </Track>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              aria-label="Image URL"
              placeholder="Image URL"
              value={url}
              disabled={busy}
              className="min-w-0 flex-1 max-sm:h-11"
              onChange={event => setUrl(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addUrl() } }}
            />
            <Track className="shrink-0 overflow-visible">
              <Pill className="max-sm:h-11" disabled={busy || !url.trim()} onClick={addUrl}>Add URL</Pill>
            </Track>
          </div>
        </div>
      </div>
      {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  )
}

type PhotoCommandResponse = { success: true; data: unknown } | { success: false; error: string; rejected: boolean }

/** Uploads one staged or typed photo to an existing unit. The key makes a retry safe. */
export async function uploadVehiclePhoto(stockId: string, photo: { file: File | null; url: string }, idempotencyKey: string): Promise<PhotoCommandResponse> {
  const form = new FormData()
  form.append('stockId', stockId)
  form.append('idempotencyKey', idempotencyKey)
  if (photo.file) form.append('photo', await preparePhoto(photo.file))
  else form.append('imageUrl', photo.url)
  return addInventoryVehiclePhoto(form)
}

/** Photo editor for a stocked unit: every change is saved straight away and returns the listing to draft. */
export function LiveVehiclePhotos({
  stockId,
  images,
  label = 'Photos',
  onChanged,
}: {
  stockId: string
  images: InventoryVehiclePhoto[]
  label?: string
  onChanged: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Labels follow the photo, not its position, so reorder buttons keep their names. File names are not
  // stored on VehicleImage: a photo uploaded here keeps its file name until reload, others are numbered
  // in the order first seen and never renumbered.
  const names = useRef(new Map<string, string>())
  const nextNumber = useRef(1)
  const nameFor = (id: string) => {
    let name = names.current.get(id)
    if (!name) {
      name = `Photo ${nextNumber.current++}`
      names.current.set(id, name)
    }
    return name
  }
  const tiles: PhotoTile[] = images.map(image => ({ id: image.id, url: image.url, name: nameFor(image.id) }))

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      setError(await work())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save photos.')
    } finally {
      setStatus(null)
      await onChanged()
      setBusy(false)
    }
  }

  const addPhotos = (photos: Array<{ file: File | null; url: string }>) => run(async () => {
    const failures: string[] = []
    for (const [index, photo] of photos.entries()) {
      if (photos.length > 1) setStatus(`Uploading ${index + 1} of ${photos.length}`)
      try {
        const response = await uploadVehiclePhoto(stockId, photo, `inventory-photo:${stockId}:${crypto.randomUUID()}`)
        if (!response.success) failures.push(response.error)
        else {
          const createdId = (response.data as { addInventoryVehiclePhoto?: { id?: string; reused?: boolean } } | null)?.addInventoryVehiclePhoto
          if (createdId?.id && !createdId.reused && !names.current.has(createdId.id)) {
            names.current.set(createdId.id, photo.file?.name || photo.url.split('/').pop()?.split('?')[0] || `Photo ${nextNumber.current++}`)
          }
        }
      } catch (caught) {
        failures.push(caught instanceof Error ? caught.message : 'Upload failed.')
      }
    }
    if (!failures.length) return null
    return failures.length === photos.length && photos.length === 1
      ? failures[0]
      : `${failures.length} of ${countLabel(photos.length, 'photo')} did not upload. ${failures[0]}`
  })

  return (
    <VehiclePhotoEditor
      label={label}
      tiles={tiles}
      busy={busy}
      status={status}
      error={error}
      onAddFiles={files => addPhotos(files.map(file => ({ file, url: '' })))}
      onAddUrl={url => addPhotos([{ file: null, url }])}
      onMove={(id, to) => run(async () => {
        const imageIds = reorderPhotoIds(images.map(image => image.id), id, to)
        const response = await arrangeInventoryVehiclePhotos({ stockId, imageIds, idempotencyKey: `inventory-photo-arrange:${stockId}:${crypto.randomUUID()}` })
        return response.success ? null : response.error
      })}
      onRemove={id => run(async () => {
        const response = await removeInventoryVehiclePhoto({ stockId, imageId: id, idempotencyKey: `inventory-photo-remove:${stockId}:${crypto.randomUUID()}` })
        return response.success ? null : response.error
      })}
    />
  )
}
