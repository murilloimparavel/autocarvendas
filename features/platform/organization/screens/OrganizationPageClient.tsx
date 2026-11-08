'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Notice, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { AccessSection, MEMBERSHIP_STATUS } from '../components/AccessSection'
import { DealerGroupSection, RECORD_STATUS } from '../components/DealerGroupSection'
import { formatDate } from '../components/FormDialog'
import { RetentionSection } from '../components/RetentionSection'
import { RolesSection } from '../components/RolesSection'
import { RooftopsSection } from '../components/RooftopsSection'
import type { OrganizationData, OrganizationTab } from '../lib/types'
import { countLabel } from '@/features/platform/lib/format'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function OrganizationPageClient({
  data,
  initialTab,
  timeZone,
}: {
  data: OrganizationData
  initialTab: OrganizationTab
  timeZone: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const router = useRouter()
  const [tab, setTab] = useState<OrganizationTab>(initialTab)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const [accessFilter, setAccessFilter] = useState<'active' | 'invited'>('active')

  const changeTab = (next: OrganizationTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'group') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
  }

  const refresh = () => startRefresh(() => router.refresh())
  const onChanged = (message: string) => {
    setNotice(message)
    refresh()
  }

  const group = data.dealerGroups[0]
  const activeRooftops = data.rooftops.filter(rooftop => rooftop.status === 'active').length
  const activeMembers = data.memberships.filter(membership => membership.status === 'active').length
  const pendingInvites = data.memberships.filter(membership => membership.status === 'invited').length

  // Needs you: invites waiting to be activated (oldest first), then rooftops that are suspended.
  const waitingInvites = data.memberships
    .filter(membership => membership.status === 'invited')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  const suspendedRooftops = data.rooftops.filter(rooftop => rooftop.status === 'suspended')
  const queueCount = waitingInvites.length + suspendedRooftops.length

  const openInvites = () => {
    setAccessFilter('invited')
    changeTab('access')
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Organização' : 'Organization' },
  ]

  const groupState = data.errors.organization ? (pt ? 'Indisponível' : 'Unavailable') : group ? (RECORD_STATUS[group.status]?.label ?? group.status) : (pt ? 'Não configurado' : 'Not set up')

  const header = (
    <DeskHeader
      title={group?.name || (pt ? 'Organização' : 'Organization')}
      status={groupState}
      meta={pt
        ? `${groupState} · ${activeRooftops} ${activeRooftops === 1 ? 'loja ativa' : 'lojas ativas'} · ${activeMembers} ${activeMembers === 1 ? 'membro ativo' : 'membros ativos'}${pendingInvites ? ` · ${pendingInvites} convites pendentes` : ''} · ${data.roles.length} ${data.roles.length === 1 ? 'função' : 'funções'}`
        : `${groupState} · ${countLabel(activeRooftops, 'active rooftop')} · ${countLabel(activeMembers, 'active member')}${pendingInvites ? ` · ${pendingInvites} invited` : ''} · ${countLabel(data.roles.length, 'role')}`}
      actions={
        <Pill variant="plain" className="h-11 sm:h-8" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {pt ? 'Atualizar' : 'Refresh'}
        </Pill>
      }
    />
  )

  return (
    <PageContainer title={pt ? 'Organização' : 'Organization'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
        {queueCount > 0 && (
          <DeskSection title={pt ? 'Ações necessárias' : 'Needs you'} count={queueCount} id="organization-needs-you" className="pb-4">
            <DeskTable aria-labelledby="organization-needs-you">
              <thead>
                <tr>
                  <Th>{pt ? 'Pendente' : 'Waiting'}</Th>
                  <Th priority={2}>{pt ? 'Local' : 'Where'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ação' : 'Action'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {waitingInvites.map(membership => (
                  <Tr key={`invite:${membership.scopeType}:${membership.id}`}>
                    <Td className="max-w-0 min-w-[9rem]">
                      <span className="block truncate font-medium text-foreground">{membership.user?.name || membership.user?.email || (pt ? 'Pessoa desconhecida' : 'Unknown user')}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {membership.role?.name || (pt ? 'Sem função' : 'No role')}{membership.invitedBy?.name ? ` · ${pt ? 'Convidado por' : 'Added by'} ${membership.invitedBy.name}` : ''} · {formatDate(membership.updatedAt, timeZone)}
                      </span>
                    </Td>
                    <Td priority={2} className="text-muted-foreground">{membership.scopeType === 'dealer-group' ? (pt ? 'Grupo' : 'Group') : (pt ? 'Loja' : 'Rooftop')}: {membership.scopeName}</Td>
                    <Td><Status tone={MEMBERSHIP_STATUS.invited.tone}>{pt ? 'Convidado' : MEMBERSHIP_STATUS.invited.label}</Status></Td>
                    <Td align="right" className="w-px"><Pill size="sm" className="h-11 sm:h-7" onClick={openInvites}>{pt ? 'Revisar' : 'Review'}</Pill></Td>
                  </Tr>
                ))}
                {suspendedRooftops.map(rooftop => (
                  <Tr key={`rooftop:${rooftop.id}`}>
                    <Td className="max-w-0 min-w-[9rem]">
                      <span className="block truncate font-medium text-foreground">{rooftop.name} <Code>{rooftop.code}</Code></span>
                      <span className="block truncate text-xs text-muted-foreground">{pt ? 'Loja · alterações operacionais suspensas' : 'Rooftop · operating changes stopped'}</span>
                    </Td>
                    <Td priority={2} className="text-muted-foreground">{rooftop.dealerGroup?.name || (pt ? 'Sem grupo' : 'No group')}</Td>
                    <Td><Status tone={RECORD_STATUS.suspended.tone}>{RECORD_STATUS.suspended.label}</Status></Td>
                    <Td align="right" className="w-px"><Pill size="sm" className="h-11 sm:h-7" onClick={() => changeTab('rooftops')}>{pt ? 'Revisar' : 'Review'}</Pill></Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          </DeskSection>
        )}

        <Segmented<OrganizationTab>
          label={pt ? 'Seção de organização' : 'Organization section'}
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'group', label: pt ? 'Grupo de lojas' : 'Dealer group' },
            { value: 'rooftops', label: pt ? 'Lojas' : 'Rooftops', count: data.rooftops.length },
            { value: 'access', label: pt ? 'Acessos' : 'Access', count: activeMembers },
            { value: 'roles', label: pt ? 'Funções' : 'Roles', count: data.roles.length },
            { value: 'retention', label: pt ? 'Retenção de dados' : 'Retention' },
          ]}
        />

        {notice && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track><Pill size="sm" variant="plain" onClick={() => setNotice(null)}>{pt ? 'Fechar' : 'Dismiss'}</Pill></Track>
            </div>
          </Notice>
        )}

        {data.errors.organization && (tab === 'group' || tab === 'rooftops') ? (
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Organização indisponível' : 'Organization unavailable'}</p>
            <p className="mt-0.5 text-muted-foreground">{data.errors.organization}</p>
            <Track className="mt-2"><Pill size="sm" onClick={refresh}>{pt ? 'Tentar novamente' : 'Retry'}</Pill></Track>
          </Notice>
        ) : tab === 'group' ? (
          <DealerGroupSection groups={data.dealerGroups} viewer={data.viewer} timeZone={timeZone} onChanged={onChanged} />
        ) : tab === 'rooftops' ? (
          <RooftopsSection rooftops={data.rooftops} groups={data.dealerGroups} viewer={data.viewer} onChanged={onChanged} />
        ) : tab === 'access' ? (
          <AccessSection
            key={accessFilter}
            initialStatusFilter={accessFilter}
            memberships={data.memberships}
            auditEvents={data.auditEvents}
            groups={data.dealerGroups}
            rooftops={data.rooftops}
            roles={data.roles}
            staff={data.staff}
            viewer={data.viewer}
            timeZone={timeZone}
            errors={{ access: data.errors.access, audit: data.errors.audit, staff: data.errors.staff }}
            onChanged={onChanged}
          />
        ) : tab === 'roles' ? (
          <RolesSection roles={data.roles} viewer={data.viewer} error={data.errors.roles} onChanged={onChanged} />
        ) : (
          <RetentionSection rooftops={data.rooftops} policies={data.retentionPolicies} viewer={data.viewer} timeZone={timeZone} error={data.errors.retention} onChanged={onChanged} />
        )}
      </div>
    </PageContainer>
  )
}
