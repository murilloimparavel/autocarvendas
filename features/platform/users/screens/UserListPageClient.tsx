/**
 * UserListPageClient - Client Component  
 * Based on dashboard ListPageClient but hardcoded for users
 */

'use client'
import { formatInZone } from '@/features/dashboard/lib/storeTime';

import React, { useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CirclePlus } from 'lucide-react'
import { PageContainer } from '../../../dashboard/components/PageContainer'
import { PlatformFilterBar } from '../../components/PlatformFilterBar'
import { StatusTabs } from '../components/StatusTabs'
import { UserDetailsComponent, staffFunctions } from '../components/UserDetailsComponent'
import { Pagination } from '../../../dashboard/components/Pagination'
import { FilterList } from '../../../dashboard/components/FilterList'
import { CreateItemDrawerClientWrapper } from '@/features/platform/components/CreateItemDrawerClientWrapper'
import { useDashboard } from '../../../dashboard/context/DashboardProvider'
import { useSelectedFields } from '../../../dashboard/hooks/useSelectedFields'
import { useSort } from '../../../dashboard/hooks/useSort'
import { useQuery } from '@tanstack/react-query'
import { getUsers } from '../actions'
import { buildOrderByClause } from '../../../dashboard/lib/buildOrderByClause'
import { buildWhereClause } from '../../../dashboard/lib/buildWhereClause'
import { DeskHeader, DeskSection, DeskTable, Notice, Pill, Status, Td, Th, Tr, Track } from '../../components/desk'
import Link from 'next/link'
import { useLocale } from '@/features/i18n/LocaleProvider'

interface UserListPageClientProps {
  list: any
  initialData: { items: any[], count: number }
  initialError: string | null
  initialSearchParams: {
    page: number
    pageSize: number  
    search: string
  }
  statusCounts: {
    all: number
    sales: number
    service: number
    finance: number
  } | null
}

function EmptyStateDefault({ pt }: { pt: boolean }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{pt ? 'Nenhuma pessoa na equipe' : 'No staff'}</p>
}

function EmptyStateSearch({ onResetFilters, pt }: { onResetFilters: () => void; pt: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-muted-foreground">{pt ? 'Nenhum resultado' : 'No matches'}</p>
      <Track>
        <Pill size="sm" onClick={onResetFilters}>{pt ? 'Limpar filtros' : 'Reset filters'}</Pill>
      </Track>
    </div>
  )
}

export function UserListPageClient({
  list,
  initialData,
  initialError,
  initialSearchParams,
  statusCounts
}: UserListPageClientProps) {
  const router = useRouter()
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const searchParams = useSearchParams()
  const { basePath } = useDashboard()
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)

  // Hooks for sorting and field selection
  const selectedFields = useSelectedFields(list)
  const sort = useSort(list)

  // Extract current search params (reactive to URL changes)
  const currentSearchParams = useMemo(() => {
    const params: Record<string, string> = {}
    searchParams?.forEach((value, key) => {
      params[key] = value
    })
    return params
  }, [searchParams])

  const currentPage = parseInt(currentSearchParams.page || '1', 10) || 1
  const pageSize = parseInt(currentSearchParams.pageSize || list.pageSize?.toString() || '50', 10)
  const searchString = currentSearchParams.search || ''

  // Build query variables from current search params
  const variables = useMemo(() => {
    const orderBy = buildOrderByClause(list, currentSearchParams)
    const filterWhere = buildWhereClause(list, currentSearchParams)
    const searchParameters = searchString ? { search: searchString } : {}
    const searchWhere = buildWhereClause(list, searchParameters)

    // Combine search and filters
    const whereConditions = []
    if (Object.keys(searchWhere).length > 0) {
      whereConditions.push(searchWhere)
    }
    if (Object.keys(filterWhere).length > 0) {
      whereConditions.push(filterWhere)
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {}

    return {
      where,
      take: pageSize,
      skip: (currentPage - 1) * pageSize,
      orderBy
    }
  }, [list, currentSearchParams, currentPage, pageSize, searchString])

  // Refetch through the same staff-only server action as the first render, so storefront
  // shoppers (Users without a role or dealership membership) never enter the list.
  const { data: queryData, error: queryError } = useQuery({
    queryKey: ['platform', 'staff', variables],
    queryFn: async () => {
      const response = await getUsers(variables.where, variables.take, variables.skip, variables.orderBy)
      if (!response.success) throw new Error(response.error || 'Failed to fetch users')
      return response.data
    },
    initialData: initialError ? undefined : initialData,
    staleTime: 30 * 1000,
  })

  // Use query data, fallback to initial data
  const data = queryData || initialData
  const error = queryError ? queryError.message : initialError

  // Handle page change - simplified since FilterBar handles search/filters
  const handlePageChange = useCallback((newPage: number) => {
    const params = new URLSearchParams(window.location.search)
    
    if (newPage && newPage > 1) {
      params.set('page', newPage.toString())
    } else {
      params.delete('page')
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : ''
    router.push(newUrl)
  }, [router])

  // Handle reset filters
  const handleResetFilters = useCallback(() => {
    router.push(window.location.pathname)
  }, [router])

  if (!list) {
    return (
      <PageContainer title={pt ? 'Lista não encontrada' : "List not found"}>
        <div className="px-4 md:px-6">
          <Notice tone="bad">{pt ? 'Lista não encontrada' : "List not found"}</Notice>
        </div>
      </PageContainer>
    )
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Equipe' : 'Staff' }
  ]

  const header = (
    <DeskHeader
      title={pt ? 'Equipe' : 'Staff'}
      meta={statusCounts ? `${statusCounts.all} ${pt ? 'pessoas' : statusCounts.all === 1 ? 'member' : 'members'} · ${statusCounts.sales} ${pt ? 'vendas' : 'sales'} · ${statusCounts.service} ${pt ? 'oficina' : 'service'} · ${statusCounts.finance} ${pt ? 'financeiro' : 'finance'}` : undefined}
      actions={
        <Pill variant="primary" onClick={() => setIsCreateDrawerOpen(true)} aria-label={pt ? 'Adicionar pessoa à equipe' : 'Add staff member'}>
          <CirclePlus />
          {pt ? 'Adicionar pessoa' : 'Add staff member'}
        </Pill>
      }
    />
  )

  // Needs you: members on this page with no role, oldest first. They can't be routed leads or deals until one is set.
  const needsRole = (data?.items ?? [])
    .filter((user: any) => !user.role)
    .sort((a: any, b: any) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))

  // Check if we have any active filters (search or actual filters)
  const hasFilters = !!searchString || Object.keys(currentSearchParams).some((key) => key.startsWith('!'))
  const isFiltered = hasFilters
  const isEmpty = data?.count === 0 && !isFiltered

  return (
    <PageContainer title={pt ? 'Equipe' : 'Staff'} header={header} breadcrumbs={breadcrumbs}>
      {/* Needs you: staff waiting on a role */}
      {!error && needsRole.length > 0 && (
        <div className="px-4 pb-6 md:px-6">
          <DeskSection title={pt ? 'Sem função definida' : 'Needs a role'} count={needsRole.length} id="staff-needs-role">
            <DeskTable aria-labelledby="staff-needs-role">
              <thead>
                <tr>
                  <Th>{pt ? 'Pessoa' : 'Member'}</Th>
                  <Th priority={2}>{pt ? 'Áreas' : 'Functions'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={2}>{pt ? 'Adicionada em' : 'Added'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ação' : 'Action'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {needsRole.map((user: any) => {
                  const functions = staffFunctions(user)
                  return (
                    <Tr key={user.id}>
                      <Td className="max-w-0 min-w-[9rem]">
                        <span className="block font-medium text-foreground [overflow-wrap:anywhere]">{user.name || user.email}</span>
                        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.email}</span>
                      </Td>
                      <Td priority={2} className="text-muted-foreground">{functions.length ? functions.map((item) => item.label).join(', ') : (pt ? 'Nenhuma' : 'None')}</Td>
                      <Td><Status tone="warn">{pt ? 'Sem função' : "No role"}</Status></Td>
                      <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">
                        {user.createdAt ? formatInZone(user.createdAt, locale, "date") : (pt ? 'Desconhecida' : 'Unknown')}
                      </Td>
                      <Td align="right" className="w-px">
                        <Pill size="sm" asChild className="max-sm:h-10">
                          <Link href={`${basePath}/users/${user.id}`}>{pt ? 'Definir função' : 'Assign role'}</Link>
                        </Pill>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          </DeskSection>
        </div>
      )}

      {/* Role tabs */}
      {statusCounts && (
        <div className="px-4 pb-4 md:px-6">
          <StatusTabs statusCounts={statusCounts} />
        </div>
      )}

      {/* Filter Bar - search, filters and sorting; the create action lives in the header */}
      <div className="px-4 md:px-6">
        <PlatformFilterBar
          list={list}
          customCreateButton={<span hidden />}
        />
      </div>

      {/* Active Filters */}
      <div className="px-4 md:px-6">
        <FilterList list={list} />
      </div>

      {/* Staff list */}
      {error ? (
        <div className="px-4 md:px-6">
          <Notice tone="bad">{pt ? 'Não foi possível carregar a equipe' : 'Unable to load staff'}: {error}</Notice>
        </div>
      ) : isEmpty ? (
        <div className="px-4 md:px-6">
          <EmptyStateDefault pt={pt} />
        </div>
      ) : data?.count === 0 ? (
        <div className="px-4 md:px-6">
          <EmptyStateSearch onResetFilters={handleResetFilters} pt={pt} />
        </div>
      ) : (
        <>
          <div className="px-4 pb-2 md:px-6">
            <DeskTable aria-label={pt ? 'Equipe' : "Staff"}>
              <thead>
                <tr>
                  <Th>{pt ? 'Pessoa' : 'Member'}</Th>
                  <Th priority={2}>{pt ? 'Função' : 'Role'}</Th>
                  <Th priority={3}>{pt ? 'Áreas' : 'Functions'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={2}>{pt ? 'Atividades' : 'Workload'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((user: any) => (
                  <UserDetailsComponent key={user.id} user={user} list={list} />
                ))}
              </tbody>
            </DeskTable>
          </div>

          {/* Pagination */}
          {data && data.count > pageSize && (
            <div className="px-4 md:px-6 py-4">
              <Pagination
                currentPage={currentPage}
                total={data.count}
                pageSize={pageSize}
                list={{ singular: pt ? 'pessoa da equipe' : 'staff member', plural: pt ? 'pessoas da equipe' : 'staff members' }}
              />
            </div>
          )}
          <div aria-hidden="true" className="h-20" />
        </>
      )}

      {/* Create Item Drawer */}
      <CreateItemDrawerClientWrapper
        listKey="users"
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        onCreate={() => {
          window.location.reload();
        }}
      />
    </PageContainer>
  )
}
