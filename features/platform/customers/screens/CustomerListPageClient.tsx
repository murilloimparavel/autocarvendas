'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { basePath } from '@/features/dashboard/lib/config'
import { DeskHeader, DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import { formatDay, personName } from '@/features/platform/crm/lib/leadOptions'
import { getCustomers, type CustomerListFilters, type CustomerRow } from '../actions'
import { customerLabel } from '../lib/locale'

type ListData = { customers: CustomerRow[]; counts: { active: number; merged: number; all: number }; page: number; pageSize: number }

const CHANNEL_LABEL: Record<string, string> = { email: 'Prefers email', sms: 'Prefers SMS', phone: 'Prefers phone' }

export function CustomerListPageClient({
  initialFilters,
  initialData,
  initialError,
  timeZone,
}: {
  initialFilters: CustomerListFilters
  initialData: ListData | null
  initialError: string | null
  timeZone: string
}) {
  const { locale } = useLocale()
  const text = useCallback((value: string) => customerLabel(locale, value), [locale])
  const router = useRouter()
  const [filters, setFilters] = useState<CustomerListFilters>(initialFilters)
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<ListData | null>(initialData)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const firstLoad = useRef(true)
  const requestId = useRef(0)

  const load = useCallback(async (next: CustomerListFilters) => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const response = await getCustomers(next)
    if (id !== requestId.current) return
    if (response.success) setData(response.data)
    else setError(text(response.error || 'Unable to load customers'))
    setLoading(false)
  }, [text])

  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return }
    load(filters)
  }, [filters, load])

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters(prev => (prev.search === searchInput.trim() ? prev : { ...prev, search: searchInput.trim(), page: 0 }))
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const update = (patch: Partial<CustomerListFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 0 }))
  const counts = data?.counts
  const total = counts ? counts[filters.status] : 0
  const pageSize = data?.pageSize ?? 50
  const pageStart = total === 0 ? 0 : filters.page * pageSize + 1
  const pageEnd = Math.min(total, (filters.page + 1) * pageSize)
  const isFiltered = Boolean(filters.search) || filters.segment !== 'all'

  const breadcrumbs = [
    { type: 'link' as const, label: text('Dashboard'), href: basePath },
    { type: 'page' as const, label: text('Platform') },
    { type: 'page' as const, label: text('Customers') },
  ]

  const header = (
    <DeskHeader
      title={text('Customers')}
      tone={error ? 'bad' : 'ok'}
      status={error ? text('Unavailable') : text('Available')}
      meta={counts ? `${counts.active} ${locale === 'pt-BR' ? 'clientes ativos' : 'active'} · ${counts.merged} ${locale === 'pt-BR' ? 'cadastros unificados' : 'merged'}` : undefined}
      actions={
        <Pill variant="plain" className="max-md:h-10" onClick={() => load(filters)} disabled={loading} aria-label={text('Refresh')}><RefreshCw className={loading ? 'animate-spin' : undefined} /></Pill>
      }
    />
  )

  const openCustomer = (id: string) => router.push(`${basePath}/platform/customers/${id}`)

  return (
    <PageContainer title={text('Customers')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
        <div className="relative min-w-0 max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={text('Search name, email, phone')}
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            className="h-11 rounded-[4px] pl-9 text-sm"
            aria-label={text('Search customers')}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <Segmented
            label={text('Customer status')}
            value={filters.status}
            onChange={status => update({ status })}
            className="max-md:[&_button]:h-10"
            options={[
              { value: 'active', label: text('Active'), count: counts?.active, tone: 'ok' },
              { value: 'merged', label: text('Merged'), count: counts?.merged, tone: 'idle' },
              { value: 'all', label: text('All'), count: counts?.all },
            ]}
          />
          <div className="grid min-w-0 grid-cols-2 gap-2 md:flex">
            <Select value={filters.segment} onValueChange={value => update({ segment: value as CustomerListFilters['segment'] })}>
              <SelectTrigger className="h-10 min-w-0 rounded-[4px] px-2.5 text-[13px] md:h-9 md:w-[190px]" aria-label={text('Filter customers')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text('All customers')}</SelectItem>
                <SelectItem value="open-leads">{text('With open leads')}</SelectItem>
                <SelectItem value="household">{text('In a household')}</SelectItem>
                <SelectItem value="reachable">{text('Preferred channel set')}</SelectItem>
                <SelectItem value="suppressed">{text('Any suppression')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.sort} onValueChange={value => update({ sort: value as CustomerListFilters['sort'] })}>
              <SelectTrigger className="h-10 min-w-0 rounded-[4px] px-2.5 text-[13px] md:h-9 md:w-[170px]" aria-label={text('Sort customers')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">{text('Recently updated')}</SelectItem>
                <SelectItem value="newest">{text('Newest first')}</SelectItem>
                <SelectItem value="name">{text('Last name')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && !data ? (
          <Panel className="divide-y" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2 px-4 py-3">
                <div className="h-3.5 w-40 animate-pulse rounded-[2px] bg-muted" />
                <div className="h-3 w-64 max-w-full animate-pulse rounded-[2px] bg-muted" />
              </div>
            ))}
          </Panel>
        ) : error ? (
          <Notice tone="bad">
            <p className="font-medium">{text('Unable to load customers')}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
            <Track className="mt-2"><Pill size="sm" onClick={() => load(filters)}>{text('Retry')}</Pill></Track>
          </Notice>
        ) : !data || data.customers.length === 0 ? (
          <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{isFiltered ? text('No matching customers') : text('No customers')}</p>
            {isFiltered && (
              <Track><Pill size="sm" className="max-md:h-10" onClick={() => { setSearchInput(''); setFilters({ ...initialFilters, status: filters.status }) }}>{text('Reset filters')}</Pill></Track>
            )}
          </Panel>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
            <DeskTable aria-label={text('Customers')}>
              <thead>
                <tr>
                  <Th>{text('Customer')}</Th>
                  <Th priority={2}>{text('Status')}</Th>
                  <Th priority={2}>{text('Contact')}</Th>
                  <Th align="right">{text('Open leads')}</Th>
                  <Th priority={3}>{text('Household')}</Th>
                  <Th priority={3}>{text('Updated')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map(customer => {
                  const merged = customer.status === 'merged'
                  const suppressed = customer.emailSuppressed || customer.smsSuppressed || customer.phoneSuppressed
                  const contact = [customer.primaryEmail, formatPhone(customer.primaryPhone, locale)].filter(Boolean).join(' · ') || text('No contact')
                  const notes = [
                    merged ? `${text('Merged into')} ${personName(customer.mergedInto?.firstName, customer.mergedInto?.lastName, text('customer'))}` : null,
                    CHANNEL_LABEL[customer.preferredChannel || ''] ? text(CHANNEL_LABEL[customer.preferredChannel || '']) : null,
                    suppressed ? text('Suppressed') : null,
                  ].filter(Boolean).join(' · ')
                  return (
                    <Tr key={customer.id} className="cursor-pointer" onClick={() => openCustomer(customer.id)}>
                      <Td className="min-w-0 max-w-[18rem]">
                        <Link href={`${basePath}/platform/customers/${customer.id}`} onClick={event => event.stopPropagation()} className="font-medium text-foreground hover:underline">
                          {personName(customer.firstName, customer.lastName)}
                        </Link>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere] md:hidden">{contact}</p>
                        {merged && <p className="text-xs md:hidden"><Status tone="idle" className="text-xs">{text('Merged')}</Status></p>}
                        {notes && <p className="break-words text-xs text-muted-foreground">{notes}</p>}
                      </Td>
                      <Td priority={2}><Status tone={merged ? 'idle' : 'ok'}>{merged ? text('Merged') : text('Active')}</Status></Td>
                      <Td priority={2} className="min-w-0 max-w-[16rem] truncate text-muted-foreground">{contact}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className={customer.openLeadsCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{customer.openLeadsCount}</span>
                        <span className="text-xs text-muted-foreground"> / {customer.leadsCount}</span>
                      </Td>
                      <Td priority={3} className="text-muted-foreground">{customer.household?.displayName || '-'}</Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDay(customer.updatedAt, timeZone, locale)}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs tabular-nums text-muted-foreground">{pageStart}-{pageEnd} {locale === 'pt-BR' ? 'de' : 'of'} {total}</p>
              <Track>
                <Pill size="sm" className="h-10 sm:h-7" disabled={filters.page === 0 || loading} onClick={() => update({ page: filters.page - 1 })} aria-label={text('Previous page')}><ChevronLeft /></Pill>
                <Pill size="sm" className="h-10 sm:h-7" disabled={pageEnd >= total || loading} onClick={() => update({ page: filters.page + 1 })} aria-label={text('Next page')}><ChevronRight /></Pill>
              </Track>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
