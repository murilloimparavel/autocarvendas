/**
 * HomePage for Dashboard 2 - Server Component
 * Follows Dashboard1's server-side rendering approach
 */

import React from 'react'
import Link from 'next/link'
import { PlusIcon, Database } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageContainer } from '../../components/PageContainer'
import { getAdminMetaAction, getListCounts } from '../../actions'
import { cn } from '@/lib/utils'
import { getRequestLocale } from '@/features/i18n/server'

interface ListCardProps {
  list: any
  count?: number | null
  hideCreate?: boolean
}

function ListCard({ list, count, hideCreate = false, pt }: ListCardProps & { pt: boolean }) {
  const isSingleton = list.isSingleton || false
  const href = `/dashboard/${list.path}${isSingleton ? '/1' : ''}`

  return (
    <Card className={cn(
      'relative bg-gradient-to-bl from-background to-muted/80 shadow-xs hover:bg-muted transition-colors'
    )}>
      <Link href={href}>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {list.label}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSingleton 
              ? (pt ? 'Cadastro único' : 'Singleton')
              : count === null || count === undefined
                ? (pt ? 'Quantidade indisponível' : 'Unknown')
                : pt ? `${count} ${count === 1 ? 'registro' : 'registros'}` : `${count} item${count !== 1 ? 's' : ''}`
            }
          </p>
        </CardContent>
      </Link>
      
      {!hideCreate && !isSingleton && (
        <Link 
          href={`/dashboard/${list.path}/create`}
          className="absolute top-3 right-3"
        >
          <Button
            variant="outline" 
            size="icon"
            className="h-7 w-7"
            title={pt ? `Adicionar ${list.singular?.toLowerCase() || 'registro'}` : `Add ${list.singular?.toLowerCase() || 'item'}`}
          >
            <PlusIcon className="h-4 w-4" />
            <span className="sr-only">{pt ? `Cadastrar ${list.label}` : `Create new ${list.label}`}</span>
          </Button>
        </Link>
      )}
    </Card>
  )
}

function EmptyState({ pt }: { pt: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Database className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{pt ? 'Nenhuma lista configurada' : 'No lists configured'}</h3>
      <p className="text-muted-foreground">
        {pt ? 'Não há modelos de dados configurados na interface administrativa.' : 'There are no data models configured in your admin interface.'}
      </p>
    </div>
  )
}

export async function HomePage() {
  const locale = await getRequestLocale()
  const pt = locale === 'pt-BR'
  // Fetch admin meta server-side
  const adminMetaResponse = await getAdminMetaAction()
  
  if (!adminMetaResponse.success) {
    console.error('Failed to fetch admin meta:', adminMetaResponse.error)
    return (
      <PageContainer 
        title={pt ? 'Painel' : 'Dashboard'}
        header={<h1 className="text-lg font-semibold md:text-2xl">{pt ? 'Painel' : 'Dashboard'}</h1>}
        breadcrumbs={[{ type: 'page' as const, label: pt ? 'Painel' : 'Dashboard' }]}
      >
        <EmptyState pt={pt} />
      </PageContainer>
    )
  }

  const adminMeta = adminMetaResponse.data
  const lists = adminMeta?.lists || []
  // Lists are already enhanced with gqlNames from getAdminMetaAction
  const enhancedLists = lists.filter((list: any) => !list.isHidden)

  // Fetch list counts server-side
  let countData: Record<string, number> = {}
  if (enhancedLists.length > 0) {
    const countResponse = await getListCounts(enhancedLists)
    if (countResponse.success && countResponse.data) {
      countData = countResponse.data
    }
  }

  const header = (
    <div className="flex flex-col">
      <h1 className="text-lg font-semibold md:text-2xl">{pt ? 'Painel' : 'Dashboard'}</h1>
      {enhancedLists.length > 0 && (
        <p className="text-muted-foreground">{enhancedLists.length} {pt ? 'modelos' : 'Models'}</p>
      )}
    </div>
  )

  const breadcrumbs = [
    { type: 'page' as const, label: pt ? 'Painel' : 'Dashboard' }
  ]

  if (enhancedLists.length === 0) {
    return (
      <PageContainer title={pt ? 'Painel' : 'Dashboard'} header={header} breadcrumbs={breadcrumbs}>
        <EmptyState pt={pt} />
      </PageContainer>
    )
  }

  return (
    <PageContainer title={pt ? 'Painel' : 'Dashboard'} header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-4xl p-4 md:p-6 flex flex-col gap-4">
        <div className="mb-4">
          <h2 className="tracking-wide uppercase font-medium mb-2 text-muted-foreground text-sm">
            {pt ? 'Cadastros' : 'Data Models'}
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-4">
            {enhancedLists.map((list: any) => (
              <ListCard
                key={list.key}
                list={list}
                count={countData[list.key] ?? null}
                hideCreate={list.hideCreate ?? false}
                pt={pt}
              />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

export default HomePage
