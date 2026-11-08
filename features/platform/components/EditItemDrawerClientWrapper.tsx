'use client'

import React, { useState, useEffect } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { EditItemDrawerClient } from './EditItemDrawerClient'
import { getListByPath } from '@/features/dashboard/actions/getListByPath'
import { getItemAction } from '@/features/dashboard/actions/getItemAction'
import { toast } from 'sonner'
import { useLocale } from '@/features/i18n/LocaleProvider'

interface EditItemDrawerClientWrapperProps {
  listKey: string
  itemId: string
  open: boolean
  onClose: () => void
  onSave?: (updatedItem: any) => void
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-6 border-b">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex-shrink-0 p-6 border-t">
        <div className="flex gap-2 justify-end">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  )
}

// Client Component Wrapper - handles data fetching on client side
export function EditItemDrawerClientWrapper({
  listKey,
  itemId,
  open,
  onClose,
  onSave
}: EditItemDrawerClientWrapperProps) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [list, setList] = useState<any>(null)
  const [item, setItem] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!open) return

      try {
        setIsLoading(true)
        setError(null)

        // Fetch list metadata
        const listData = await getListByPath(listKey)
        if (!listData) {
          setError(pt ? `Lista não encontrada: ${listKey}` : `List not found: ${listKey}`)
          return
        }
        setList(listData)

        // Fetch item data
        const itemResponse = await getItemAction(listData, itemId)
        if (!itemResponse.success) {
          setError(itemResponse.error || (pt ? 'Não foi possível carregar o registro' : 'Failed to load item'))
          return
        }
        if (!itemResponse.data?.item) {
          setError(pt ? 'Não foi possível carregar o registro' : 'Failed to load item')
          return
        }
        setItem(itemResponse.data.item)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError(err instanceof Error ? err.message : (pt ? 'Erro desconhecido' : 'Unknown error'))
        toast.error(pt ? 'Não foi possível carregar os dados do registro' : 'Failed to load item data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [listKey, itemId, open, pt])

  // If not open, render empty drawer
  if (!open) {
    return (
      <Drawer open={false} onOpenChange={onClose}>
        <DrawerContent />
      </Drawer>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="flex flex-col">
        {isLoading ? (
          <>
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle>{pt ? 'Carregando…' : 'Loading…'}</DrawerTitle>
            </DrawerHeader>
            <LoadingSkeleton />
          </>
        ) : error ? (
          <>
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle>{pt ? 'Erro' : 'Error'}</DrawerTitle>
            </DrawerHeader>
            <div className="p-6 text-center">
              <p className="text-destructive">{error}</p>
            </div>
          </>
        ) : list && item ? (
          <EditItemDrawerClient
            list={list}
            item={item}
            itemId={itemId}
            onClose={onClose}
            onSave={onSave}
          />
        ) : (
          <>
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle>{pt ? 'Erro' : 'Error'}</DrawerTitle>
            </DrawerHeader>
            <div className="p-6 text-center">
              <p className="text-destructive">{pt ? 'Não foi possível carregar os dados' : 'Failed to load data'}</p>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
