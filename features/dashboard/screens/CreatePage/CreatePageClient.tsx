/**
 * CreatePageClient for Dashboard 2
 * Client component with form functionality matching ItemPage layout
 */

'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, ArrowLeft, AlertTriangle, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PageBreadcrumbs } from '../../components/PageBreadcrumbs'
import { useDashboard } from '../../context/DashboardProvider'
import { Fields } from '../../components/Fields'
import { useCreateItem } from '../../utils/useCreateItem'
import { enhanceFields } from '../../utils/enhanceFields'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { translateSchemaLabel } from '@/features/i18n/messages'

interface CreatePageClientProps {
  listKey: string
  list: any
}

// Cancel Button Component (matches ItemPage pattern)
function CancelButton({ 
  onCancel,
  isDesktop = true 
}: { 
  onCancel: () => void;
  isDesktop?: boolean;
}) {
  const { t } = useLocale()
  return (
    <Button variant="outline" size="sm" className="text-xs" onClick={onCancel}>
      <X className="size-3 shrink-0" />
      {isDesktop ? (
        t('cancel')
      ) : (
        <span className="hidden sm:inline">{t('cancel')}</span>
      )}
    </Button>
  )
}

export function CreatePageClient({ listKey, list }: CreatePageClientProps) {
  const { t, locale } = useLocale()
  const { basePath } = useDashboard()
  const router = useRouter()
  
  // Create enhanced fields like Keystone does - same pattern as ItemPage
  const enhancedFields = useMemo(() => {
    return enhanceFields(list.fields || {}, list.key)
  }, [list.fields, list.key])
  
  // Use the create item hook with enhanced fields
  const createItem = useCreateItem(list, enhancedFields)

  const handleSave = useCallback(async () => {
    if (!createItem) return
    
    // Check for invalid fields before attempting to create - same pattern as ItemPage
    if (createItem.props.invalidFields.size !== 0) {
      return
    }
    
    const item = await createItem.create()
    if (item?.id) {
      router.push(`${basePath}/${list.path}/${item.id}`)
    }
  }, [createItem, router, basePath, list])

  const handleCancel = useCallback(() => {
    router.push(`${basePath}/${list.path}`)
  }, [router, basePath, list])

  if (!list) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('requestedListNotFound')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!createItem) {
    const listLabel = translateSchemaLabel(locale, list.label)
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('createFormInitFailed').replace('{list}', listLabel)}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Breadcrumb items
  const breadcrumbItems = [
    { type: 'link' as const, label: t('dashboard'), href: '/' },
    { type: 'link' as const, label: translateSchemaLabel(locale, list.label), href: `/${list.path}` },
    { type: 'page' as const, label: t('create') }
  ]

  // Split fields by position for sidebar/main layout (same pattern as ItemPage)
  const fieldsSplit = useMemo(() => {
    const sidebarFields: Record<string, any> = {}
    const mainFields: Record<string, any> = {}
    
    Object.entries(enhancedFields).forEach(([key, field]) => {
      // For now, put all fields in main - same as ItemPage logic
      mainFields[key] = field
    })
    
    return { sidebarFields, mainFields }
  }, [enhancedFields])

  return (
    <>
      {/* Breadcrumbs */}
      <PageBreadcrumbs 
        items={breadcrumbItems} 
        actions={
          <Button
            size="sm"
            className="sm:text-sm text-xs"
            onClick={handleSave}
            disabled={createItem.state === 'loading'}
          >
            {t('create')} {translateSchemaLabel(locale, list.singular)}
            <Check className="ml-1 stroke-[1.5px]" width="8" height="8" />
          </Button>
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
                    title={`${t('create')} ${translateSchemaLabel(locale, list.singular)}`}
                >
                  {t('create')} {translateSchemaLabel(locale, list.singular)}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('addNewSingular').replace('{singular}', translateSchemaLabel(locale, list.singular).toLowerCase()).replace('{list}', translateSchemaLabel(locale, list.label).toLowerCase())}
                </p>
              </div>

              {/* Sidebar Fields (if any) */}
              {Object.keys(fieldsSplit.sidebarFields).length > 0 && (
                <Fields {...createItem.props} fields={fieldsSplit.sidebarFields} view="createView" groups={list.groups} />
              )}
            </div>

          </aside>


          {/* Main content */}
          <div className="space-y-6">
            {/* GraphQL errors */}
            {(createItem.error?.networkError || createItem.error?.graphQLErrors?.length) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="whitespace-pre-line break-words">
                  {createItem.error.networkError?.message || 
                   createItem.error.graphQLErrors?.[0]?.message ||
                   t('createItemFailed')
                  }
                </AlertDescription>
              </Alert>
            )}

            {/* Main Fields */}
            {Object.keys(fieldsSplit.mainFields).length > 0 && (
              <Fields {...createItem.props} fields={fieldsSplit.mainFields} view="createView" groups={list.groups} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default CreatePageClient
