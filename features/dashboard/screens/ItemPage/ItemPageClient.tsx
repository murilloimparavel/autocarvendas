/**
 * ItemPageClient - Client Component
 * Based on Keystone's ItemPage implementation but using ShadCN components
 * Now using React Query mutations for update/delete operations
 */

'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Fields } from '../../components/Fields'
import { PageBreadcrumbs } from '../../components/PageBreadcrumbs'
import { useInvalidFields } from '../../utils/useInvalidFields'
import { useHasChanges, serializeValueToOperationItem } from '../../utils/useHasChanges'
import { enhanceFields } from '../../utils/enhanceFields'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDashboard } from '../../context/DashboardProvider'
import { updateItemAction, deleteItemAction } from '../../actions/item-actions'
import { queryKeys } from '../../lib/queryKeys'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { translateSchemaLabel } from '@/features/i18n/messages'

interface ItemPageClientProps {
  list: any
  item: Record<string, unknown>
  itemId: string
}

// Hook for event callbacks (from Keystone)
function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

// Delete Button Component (adapted from Keystone with responsive design)
function DeleteButton({
  list,
  value,
  onError,
  queryClient,
  isDesktop = true
}: {
  list: any;
  value: Record<string, unknown>;
  onError: (error: Error) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  isDesktop?: boolean;
}) {
  const { t, locale } = useLocale()
  const itemId = ((value.id ?? '') as string | number).toString()
  const router = useRouter()
  const { basePath } = useDashboard()

  const handleDelete = useEventCallback(async () => {
    try {
      const { errors } = await deleteItemAction(list.key, itemId)

      // Handle errors exactly like Keystone does
      const error = errors?.find((x: any) => x.path === undefined || x.path?.length === 1)
      if (error) {
        toast.error(t('deleteFailure'), {
          description: error.message,
          action: {
            label: t('details'),
            onClick: () => onError(new Error(error.message))
          }
        })
        return
      }

      toast.success(t('deletedSuccessfully').replace('{singular}', translateSchemaLabel(locale, list.singular.toLowerCase())))

      // Invalidate React Query cache - this will automatically refetch the data
      // Invalidate all items queries for this list (partial match on query key)
      await queryClient.invalidateQueries({
        queryKey: ['lists', list.key, 'items']
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.items.item(list.key, itemId)
      })

      // Navigate to list page after delete
      router.push(list.isSingleton ? `${basePath}/` : `${basePath}/${list.path}`)
    } catch (err: any) {
      toast.error(t('deleteFailure'), {
        action: {
          label: t('details'),
          onClick: () => onError(err)
        }
      })
    }
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="sm:text-sm text-xs">
          <X className="size-3 shrink-0" />
          {isDesktop ? (
            t('delete')
          ) : (
            <span className="hidden sm:inline">{t('delete')}</span>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteItem')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteConfirm').replace('{singular}', `${translateSchemaLabel(locale, list.singular.toLowerCase())}${!list.isSingleton ? ` ${itemId}` : ''}`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            {t('yesDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Reset Button Component (adapted from Keystone with responsive design)
function ResetButton(props: { onReset: () => void; hasChanges?: boolean; isDesktop?: boolean }) {
  const { t } = useLocale()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="sm:text-sm text-xs" disabled={!props.hasChanges}>
          <Undo2 className="size-3 shrink-0" />
          {props.isDesktop ? (
            t('reset')
          ) : (
            <span className="hidden sm:inline">{t('reset')}</span>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('resetChanges')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('resetConfirm')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={props.onReset}>
            {t('yesReset')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Item Not Found Component (adapted from Keystone)
function ItemNotFound({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 bg-muted/40 rounded-lg p-8 border shadow">
      <div className="text-gray-400">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold">{t('recordNotFound')}</h2>
      <div className="text-center max-w-md text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

// Error Dialog Component (adapted from Keystone)
function ErrorDialog({ error, onClose }: { error: Error; onClose: () => void }) {
  const { t } = useLocale()
  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('errorDetails')}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line break-words">
            {error.message || t('saveFailure')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>
            {t('close')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Helper function to deserialize item data using enhanced fields
function deserializeItemToValue(
  enhancedFields: Record<string, any>,
  item: Record<string, unknown | null>
) {
  const result: Record<string, unknown | null> = {}
  
  Object.entries(enhancedFields).forEach(([fieldPath, field]) => {
    try {
      // Enhanced fields already have controllers
      const controller = field.controller
      
      // Create itemForField with only the GraphQL fields this controller needs
      const itemForField: Record<string, unknown> = {}
      // For now, just use the field path as the GraphQL field
      itemForField[field.path] = item?.[field.path] ?? null
      
      // Call deserialize with the properly structured data
      result[fieldPath] = controller.deserialize(itemForField)
    } catch (error) {
      console.error("Dashboard operation failed (details redacted).")
    }
  })
  
  return result
}

// Main ItemPageClient component
export function ItemPageClient({ list, item, itemId }: ItemPageClientProps) {
  const { t, locale } = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Create enhanced fields like Keystone does
  const enhancedFields = useMemo(() => {
    return enhanceFields(list.fields || {}, list.key)
  }, [list.fields, list.key])

  // Deserialize the item data once - following Keystone pattern
  const initialValue = useMemo(() => {
    return deserializeItemToValue(enhancedFields, item)
  }, [enhancedFields, item])

  // State for form values - initialized with deserialized data
  const [value, setValue] = useState(() => initialValue)
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [forceValidation, setForceValidation] = useState(false)
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  
  // Reset value when initialValue changes
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  // Create isRequireds object from enhanced fields - exactly like Keystone
  const isRequireds = useMemo(() => {
    const result: Record<string, any> = {}
    
    Object.entries(enhancedFields).forEach(([fieldPath, field]) => {
      result[fieldPath] = field.itemView?.isRequired || false
    })
    
    // Override with dynamic adminMeta data if available
    if (list.adminMetaFields) {
      list.adminMetaFields.forEach((field: any) => {
        if (field.itemView && field.itemView.isRequired !== undefined) {
          result[field.path] = field.itemView.isRequired
        }
      })
    }
    
    return result
  }, [enhancedFields, list.adminMetaFields])

  // Use Keystone's useInvalidFields hook with enhanced fields
  const invalidFields = useInvalidFields(enhancedFields, value, isRequireds)
  
  // Check if we have changes using Keystone's exact pattern with enhanced fields
  const hasChanges = useHasChanges('update', enhancedFields, value, initialValue)

  // Save handler following Keystone's exact pattern with save state
  const handleSave = useEventCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    // Check for invalid fields - exact Keystone pattern
    const newForceValidation = invalidFields.size !== 0
    setForceValidation(newForceValidation)
    if (newForceValidation) {
      return
    }

    setSaveState('saving')
    setLoading(true)

    try {
      // Serialize only changed fields - exact Keystone pattern
      const changedData = serializeValueToOperationItem('update', enhancedFields, value, initialValue)

      const { errors } = await updateItemAction(list.key, initialValue.id as string, changedData)

      // Handle errors exactly like Keystone does
      const error = errors?.find((x: any) => x.path === undefined || x.path?.length === 1)
      if (error) {
        toast.error(t('saveFailure'), {
          description: error.message,
          action: {
            label: t('details'),
            onClick: () => setErrorDialogValue(new Error(error.message))
          }
        })
        setSaveState('idle')
        return
      }

      toast.success(t('changesSaved').replace('{singular}', translateSchemaLabel(locale, list.singular.toLowerCase())))
      setSaveState('saved')

      // Reset validation state after successful save
      setForceValidation(false)

      // Reset to idle after showing saved state
      setTimeout(() => setSaveState('idle'), 3000)

      // Avoid forcing a full route refresh immediately after save;
      // it can remount uncontrolled editors (Slate) and break editing.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.items.item(list.key, itemId)
      })

    } catch (error: any) {
      console.error("Dashboard operation failed (details redacted).")
      toast.error(t('saveFailure'), {
        action: {
          label: t('details'),
          onClick: () => setErrorDialogValue(error)
        }
      })
      setSaveState('idle')
    } finally {
      setLoading(false)
    }
  })

  // Reset handler
  const handleReset = useCallback(() => {
    setValue(initialValue)
    setForceValidation(false)
  }, [initialValue])

  const pageLabel = (item[list.labelField] || item.id || itemId) as string
  const pageTitle = list.isSingleton || typeof pageLabel !== 'string' ? translateSchemaLabel(locale, list.label) : pageLabel

  // Copy ID to clipboard handler
  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(itemId)
    toast.success(t('idCopied'))
  }, [itemId, t])

  // Split fields by position for sidebar/main layout
  const fieldsSplit = useMemo(() => {
    const sidebarFields: Record<string, any> = {}
    const mainFields: Record<string, any> = {}
    
    Object.entries(enhancedFields).forEach(([key, field]) => {
      // For now, put all fields in main - you can add logic here for sidebar fields
      mainFields[key] = field
    })
    
    return { sidebarFields, mainFields }
  }, [enhancedFields])

  // Breadcrumb items
  const breadcrumbItems = [
    { type: 'link' as const, label: t('dashboard'), href: '/' },
    { type: 'link' as const, label: translateSchemaLabel(locale, list.label), href: `/${list.path}` },
    { type: 'page' as const, label: pageTitle }
  ]

  // If item doesn't exist
  if (!item || Object.keys(item).length === 0) {
    return (
      <div className="container mx-auto p-6">
        <ItemNotFound>
          {list.isSingleton ? (
            itemId === '1' ? (
              <div>
                <p>{t('itemAccessMissing').replace('{list}', translateSchemaLabel(locale, list.label))}</p>
                {!list.hideCreate && (
                  <Button className="mt-4" onClick={() => router.push(`/${list.path}/create`)}>
                    {t('create')} {translateSchemaLabel(locale, list.singular.toLowerCase())}
                  </Button>
                )}
              </div>
            ) : (
              <p>{t('itemMissing').replace('{id}', itemId)}</p>
            )
          ) : (
            <p>
              {t('itemMissing').replace('{id}', itemId)}
            </p>
          )}
        </ItemNotFound>
      </div>
    )
  }

  return (
    <>
      {/* Breadcrumbs */}
      <PageBreadcrumbs 
        items={breadcrumbItems} 
        actions={
          <div className="flex items-center gap-2">
            {!list.hideDelete && (
              <DeleteButton
                list={list}
                value={value}
                onError={setErrorDialogValue}
                queryClient={queryClient}
                isDesktop={true}
              />
            )}
            {hasChanges && (
              <ResetButton 
                hasChanges={hasChanges} 
                onReset={handleReset}
                isDesktop={true}
              />
            )}
            <Button
              size="sm"
              className="sm:text-sm text-xs"
              onClick={handleSave}
              disabled={!hasChanges || loading || saveState === 'saving'}
            >
              {t('saveChanges')}
              <Check className="ml-1 stroke-[1.5px]" width="8" height="8" />
            </Button>
          </div>
        }
      />
      
      <div className="w-full max-w-5xl p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,2fr)_3fr] gap-6 gap-y-8">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7.5rem)] flex flex-col h-full">
            <div className="space-y-6 flex-grow overflow-y-auto pb-2">
              <div>
                <h1
                  className="text-lg font-semibold md:text-2xl"
                  title={pageTitle}
                >
                  {pageTitle}
                </h1>
                <div className="mt-6">
                  <div className="relative border rounded-md bg-muted/40 transition-all">
                    <div className="p-1 flex items-center gap-3">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <div className="bg-background shadow-xs border rounded-sm py-0.5 px-1 text-[.65rem] text-muted-foreground">
                            ID
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-mono truncate">
                            {itemId}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-sm h-6 w-6 flex-shrink-0"
                        onClick={handleCopyId}
                      >
                        <Copy className="size-3" />
                        <span className="sr-only">{t('copyId')}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Fields */}
              {Object.keys(fieldsSplit.sidebarFields).length > 0 && (
                <Fields
                  list={list}
                  fields={fieldsSplit.sidebarFields}
                  value={value}
                  onChange={setValue}
                  forceValidation={forceValidation}
                  invalidFields={invalidFields}
                  isRequireds={isRequireds}
                />
              )}
            </div>

          </aside>


          {/* Main content */}
          <div className="space-y-6">
            {/* Error display */}
            {errorDialogValue && (
              <Badge className="border border-red-200 bg-red-50 text-red-700 items-start gap-4 p-4">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <h2 className="font-medium">{locale === 'pt-BR' ? 'Erro' : 'Error'}</h2>
                  <p>{errorDialogValue.message}</p>
                </div>
              </Badge>
            )}


            {/* Main Fields */}
            {Object.keys(fieldsSplit.mainFields).length > 0 && (
              <Fields
                list={list}
                fields={fieldsSplit.mainFields}
                value={value}
                onChange={setValue}
                forceValidation={forceValidation}
                invalidFields={invalidFields}
                isRequireds={isRequireds}
                groups={list.groups}
              />
            )}
          </div>
        </div>
      </div>

      {/* Error Dialog */}
      {errorDialogValue && (
        <ErrorDialog 
          error={errorDialogValue} 
          onClose={() => setErrorDialogValue(null)} 
        />
      )}
    </>
  )
}
