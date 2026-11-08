'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { useLocale } from '@/features/i18n/LocaleProvider'

/** Phone-width tap targets for desk pills and inputs. */
export const TAP = 'h-11 sm:h-8'
export const TAP_SM = 'h-11 sm:h-7'
export const TAP_INPUT = 'h-11 sm:h-9'

export function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  error?: string | null
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5 text-sm', className)}>
      <label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Dialog with a form body and a Track footer. */
export function FormDialog({
  open,
  title,
  description,
  busy,
  error,
  submitLabel = 'Save',
  onSubmit,
  onOpenChange,
  children,
  wide,
}: {
  open: boolean
  title: string
  description?: string
  busy: boolean
  error?: string | null
  submitLabel?: string
  onSubmit: () => void
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  wide?: boolean
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form noValidate onSubmit={event => { event.preventDefault(); onSubmit() }} className="space-y-4">
          {children}
          {error && <Notice tone="bad">{error}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className={TAP} disabled={busy} onClick={() => onOpenChange(false)}>{pt ? 'Cancelar' : 'Cancel'}</Pill>
              <Pill type="submit" variant="primary" className={TAP} disabled={busy}>{busy ? (pt ? 'Salvando…' : 'Saving…') : (pt && submitLabel === 'Save' ? 'Salvar' : submitLabel)}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  busy: boolean
  error?: string | null
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        <DialogFooter className="sm:justify-end">
          <Track>
            <Pill variant="plain" className={TAP} disabled={busy} onClick={() => onOpenChange(false)}>{pt ? 'Cancelar' : 'Cancel'}</Pill>
            <Pill variant="danger" className={TAP} disabled={busy} onClick={onConfirm}>{busy ? (pt ? 'Processando…' : 'Working…') : (pt && confirmLabel === 'Delete' ? 'Excluir' : confirmLabel)}</Pill>
          </Track>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>
}
