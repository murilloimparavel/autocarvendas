import type { DeskTone } from '@/features/platform/components/desk'
import type { Locale } from '@/features/i18n/messages'

export const PRODUCT_CATEGORIES = ['service-contract', 'gap', 'maintenance', 'appearance', 'tire-wheel', 'other'] as const

export const categoryLabels: Record<string, string> = {
  'service-contract': 'Service contract',
  gap: 'GAP',
  maintenance: 'Maintenance',
  appearance: 'Appearance',
  'tire-wheel': 'Tire and wheel',
  other: 'Other',
}

export function formatCents(cents: number | null | undefined, empty = '-', currencyCode = 'USD', locale: Locale = 'en-US') {
  if (cents == null) return empty
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(cents / 100)
}

export function formatDay(value: string | null | undefined, timeZone: string, locale: Locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined, timeZone: string, locale: Locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatApr(bps: number | null | undefined, locale: Locale = 'en-US') {
  return bps == null ? '-' : new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bps / 10000)
}

const financeLabelsPt: Record<string, string> = {
  'Service contract': 'Garantia estendida', GAP: 'Proteção GAP', Maintenance: 'Manutenção', Appearance: 'Estética automotiva', 'Tire and wheel': 'Pneus e rodas', Other: 'Outros',
  Unavailable: 'Indisponível', 'Approvals waiting': 'Aprovações pendentes', application: 'proposta', applications: 'propostas', waiting: 'aguardando', 'Up to date': 'Em dia',
  Today: 'Hoje', Dashboard: 'Painel', Platform: 'Plataforma', Finance: 'Financeiro', 'F&I products': 'Produtos de F&I', 'Product cancellations': 'Cancelamento de produtos',
  'Application not found or not accessible.': 'Proposta não encontrada ou sem acesso.', Application: 'Proposta', 'Financing application': 'Proposta de financiamento',
  'Application is unavailable': 'A proposta está indisponível', 'Finance applicant': 'Solicitante de financiamento', 'Retry': 'Tentar novamente', Refresh: 'Atualizar',
  'No lead on this application': 'Esta proposta não tem um lead associado', 'No contact': 'Sem contato', 'No customer': 'Sem cliente', 'Unnamed customer': 'Cliente sem nome', 'No vehicle': 'Sem veículo',
  Active: 'Ativos', Inactive: 'Inativos', All: 'Todos', 'All rooftops': 'Todas as lojas', Rooftop: 'Loja', 'New product': 'Novo produto',
  'Products are unavailable': 'Não foi possível carregar os produtos', Dismiss: 'Dispensar', 'Product status': 'Situação do produto', Category: 'Categoria', 'All categories': 'Todas as categorias',
  'Search code or name': 'Buscar por código ou nome', 'Search products': 'Buscar produtos', 'Refreshing…': 'Atualizando…', Catalog: 'Catálogo', 'No products at this rooftop': 'Nenhum produto nesta loja', 'No matching products': 'Nenhum produto encontrado', 'Reset filters': 'Limpar filtros',
  Product: 'Produto', Status: 'Situação', 'Retail price': 'Preço de venda', 'Dealer cost': 'Custo da loja', Code: 'Código', Name: 'Nome', Quotes: 'Cotações',
  'Select a rooftop.': 'Selecione uma loja.', 'Use 2-80 letters, digits, dashes or underscores.': 'Use de 2 a 80 letras, números, hífens ou sublinhados.',
  'This code already exists at this rooftop.': 'Este código já existe nesta loja.', 'Enter a product name.': 'Informe o nome do produto.', 'Use 200 characters or fewer.': 'Use até 200 caracteres.',
  'Select a category.': 'Selecione uma categoria.', 'Enter a dollar amount, for example 1,299.50.': 'Informe um valor, por exemplo 1.299,50.', 'Enter a dollar amount, for example 899.': 'Informe um valor, por exemplo 899,00.',
  Unchanged: 'Sem alteração', 'Hidden for your role; blank keeps the current cost': 'Oculto para seu perfil; deixe em branco para manter o custo atual', 'Active on menus': 'Ativo nos menus',
  'added.': 'adicionado.', 'saved.': 'salvo.', activated: 'ativado', deactivated: 'desativado',
  'Select a product': 'Selecione um produto', 'No sold products to cancel': 'Não há produtos vendidos para cancelar', 'Sold product': 'Produto vendido', Reason: 'Motivo',
  'Estimated refund (optional)': 'Valor estimado do reembolso (opcional)', 'Refund amount': 'Valor do reembolso', 'Cancellation reference': 'Protocolo do cancelamento', 'Denial reason': 'Motivo da recusa',
  Requested: 'Solicitado', Completed: 'Concluído', Denied: 'Recusado', Cancellations: 'Cancelamentos',
  active: 'ativos', inactive: 'inativos', 'No rooftop available': 'Nenhuma loja disponível', 'Retail': 'Venda', Cost: 'Custo', Margin: 'Margem',
  'Avg margin': 'Margem média', Hidden: 'Oculto', Edit: 'Editar', Activate: 'Ativar', Deactivate: 'Desativar', 'Cost hidden or no products': 'Custo oculto ou sem produtos', 'Active products': 'Produtos ativos',
  'New F&I product': 'Novo produto de F&I', product: 'produto', 'Add product': 'Adicionar produto', Save: 'Salvar', Cancel: 'Cancelar', 'Saving…': 'Salvando…', Select: 'Selecione',
  'F&I product': 'Produto de F&I', Actions: 'Ações',
  Employed: 'Empregado(a)', 'Self-employed': 'Autônomo(a)', Retired: 'Aposentado(a)', Student: 'Estudante',
  'Excellent (720+)': 'Excelente (720+)', 'Good (680–719)': 'Bom (680–719)', 'Fair (620–679)': 'Regular (620–679)', 'Rebuilding (<620)': 'Em recuperação (<620)', 'Not sure': 'Não sei',
  Cancellation: 'Cancelamento', cancellation: 'cancelamento', 'No accepted menu products to cancel': 'Não há produtos aprovados no menu para cancelar',
  'Cancellations are unavailable': 'Não foi possível carregar os cancelamentos', 'Already': 'Já', Complete: 'Concluir', Deny: 'Recusar', Deal: 'Negociação', Term: 'Prazo', 'Not recorded': 'Não informado', Sold: 'Vendido', Menu: 'Menu', 'Refund recorded': 'Reembolso registrado',
  'Refund calculation': 'Cálculo do reembolso', 'Months used': 'Meses utilizados', 'Enter whole months.': 'Informe o total de meses em número inteiro.', 'Cancellation fee': 'Taxa de cancelamento', 'Enter a dollar amount.': 'Informe um valor monetário.',
  Method: 'Método', 'Pro-rata by month': 'Proporcional aos meses', 'Flat (no term)': 'Valor fixo (sem prazo)', 'Unused months': 'Meses restantes', of: 'de', 'Unused value': 'Valor não utilizado', Fee: 'Taxa', 'Refund due': 'Reembolso devido', 'Calculated refund': 'Reembolso calculado',
  'Payment refund': 'Reembolso de pagamento', 'Payments unavailable for your role': 'Os pagamentos não estão disponíveis para o seu perfil', Open: 'Abrir', 'No refund on this deal': 'Não há reembolso nesta negociação', Payment: 'Pagamento', History: 'Histórico',
  'Cancellation status': 'Situação do cancelamento', 'Search customer, stock or product': 'Buscar cliente, estoque ou produto', 'Search cancellations': 'Buscar cancelamentos', 'Clear deal filter': 'Limpar filtro da negociação', 'One deal': 'Uma negociação', 'Selected cancellation': 'Cancelamento selecionado', Close: 'Fechar',
  'No cancellations': 'Nenhum cancelamento', 'No matching cancellations': 'Nenhum cancelamento encontrado', 'New cancellation': 'Novo cancelamento', 'Customer · product': 'Cliente · produto', Vehicle: 'Veículo', Age: 'Tempo', Refund: 'Reembolso', Refunded: 'Reembolsado', Cancellable: 'Disponível para cancelar', 'Completed cancellations': 'Cancelamentos concluídos', 'Sold products': 'Produtos vendidos',
  'Record request': 'Registrar solicitação', 'Enter why the cancellation was denied.': 'Informe por que o cancelamento foi recusado.', 'Enter the cancellation reason.': 'Informe o motivo do cancelamento.', 'Select a sold product.': 'Selecione um produto vendido.', 'Enter the refund amount, $0 if none.': 'Informe o valor do reembolso; use R$ 0,00 se não houver reembolso.', 'Enter the provider cancellation reference.': 'Informe o protocolo de cancelamento do fornecedor.',
  requested: 'solicitado', completed: 'concluído', denied: 'recusado', 'Cancellation actions': 'Ações do cancelamento', mo: 'meses', 'Calculated': 'Calculado',
  captured: 'capturado', 'partially-refunded': 'parcialmente reembolsado', refunded: 'reembolsado', succeeded: 'concluído', failed: 'falhou', pending: 'pendente',
  Pencil: 'Rascunho', Submitted: 'Enviada', Approved: 'Aprovada', Financed: 'Financiada', Delivered: 'Entregue', Cancelled: 'Cancelada',
  'Waiting approval': 'Aguardando aprovação', 'Funding exception': 'Pendência na liberação', 'Signed, unfunded': 'Assinado, sem liberação', 'Contract in transit': 'Contrato em trânsito', Unfunded: 'Não liberado', 'In F&I': 'No setor financeiro',
  'Pending decision': 'Aguardando decisão', 'Not queued': 'Não enviado', 'Queue for lender review': 'Enviar para análise da financeira', 'Task overdue': 'Tarefa atrasada', 'Manager approval': 'Aprovação do gerente',
  'No flags': 'Nenhum alerta', 'No applications': 'Nenhuma proposta', 'Open task': 'Tarefa em aberto', 'Method not recorded': 'Método não informado', 'Card (online)': 'Cartão (online)',
  'No decisions': 'Nenhuma decisão', 'No checks': 'Nenhuma verificação', 'No documents': 'Nenhum documento', 'No payments': 'Nenhum pagamento', 'No contract package': 'Nenhum pacote de contrato',
  'Paid in full': 'Quitado', Funded: 'Liberado', 'Partly paid': 'Parcialmente pago', 'Not started': 'Não iniciado', 'Clear to fund': 'Apto para liberação', Preparing: 'Em preparação', Ready: 'Pronto', Sent: 'Enviado', Viewed: 'Visualizado', Signed: 'Assinado', Void: 'Anulado',
  Identity: 'Identidade', OFAC: 'OFAC', 'Red flag': 'Alerta de fraude', 'Privacy notice': 'Aviso de privacidade', Failed: 'Falhou', 'Manual review': 'Revisão manual', Conditional: 'Condicional', Declined: 'Recusado', Expired: 'Expirado', Exception: 'Pendência', 'Recorded by staff': 'Registrado pela equipe', 'Buyer\'s order': 'Pedido de compra', 'Retail installment contract': 'Contrato de financiamento', 'Privacy disclosure': 'Aviso de privacidade', 'F&I product menu': 'Menu de produtos financeiros', Waived: 'Dispensado', Resolved: 'Resolvido', Received: 'Recebido', 'Partly refunded': 'Parcialmente reembolsado',
  Quoted: 'Cotada', 'Cannot quote': 'Sem cotação', 'not quoted': 'Sem cotação', Presented: 'Apresentado', Accepted: 'Aceito', Superseded: 'Substituído', chosen: 'escolhido', declined: 'recusado', quoted: 'cotado',
  'Low down payment': 'Entrada baixa', 'High loan-to-value': 'Percentual financiado elevado em relação ao valor do veículo', 'High APR': 'Taxa anual elevada', 'Negative gross': 'Lucro bruto negativo', 'Form 8300 required': 'Exige o formulário fiscal dos EUA 8300',
}

export function financeLabel(locale: Locale, value: string) {
  if (locale !== 'pt-BR') return value
  return financeLabelsPt[value] ?? value
}

/** Tone for free-form workflow states. */
export function stateTone(value: string | null | undefined): DeskTone {
  const state = (value || '').toLowerCase()
  if (['approved', 'accepted', 'completed', 'complete', 'signed', 'funded', 'quoted', 'submitted-to-lender', 'succeeded', 'active'].includes(state)) return 'ok'
  if (['declined', 'rejected', 'failed', 'expired', 'cancelled', 'canceled', 'void', 'denied'].includes(state)) return 'bad'
  if (['conditional', 'requested', 'pending', 'presented', 'queued', 'submitted', 'under-review', 'creating'].includes(state)) return 'warn'
  return 'idle'
}

export function personName(person: { firstName?: string | null; lastName?: string | null } | null | undefined, fallback = 'No customer') {
  if (!person) return fallback
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || fallback
}

export function vehicleName(vehicle: { year?: number | null; make?: string | null; model?: string | null } | null | undefined, fallback = 'No vehicle') {
  if (!vehicle) return fallback
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || fallback
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

/** Whole days since a timestamp; null when unknown. */
export function daysSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / 86_400_000))
}

export function formatAge(days: number | null) {
  if (days == null) return '-'
  return days === 0 ? 'Today' : `${days}d`
}

export function countLabel(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** Desk headline: manager approvals first, then storefront applications still waiting on a lender. */
export function financeDeskStatus({ error, approvalsWaiting, applicationsWaiting }: { error: boolean; approvalsWaiting: number; applicationsWaiting: number }): { tone: DeskTone; label: string } {
  if (error) return { tone: 'bad', label: 'Unavailable' }
  if (approvalsWaiting > 0) return { tone: 'warn', label: 'Approvals waiting' }
  if (applicationsWaiting > 0) return { tone: 'warn', label: `${countLabel(applicationsWaiting, 'application')} waiting` }
  return { tone: 'ok', label: 'Up to date' }
}

// Storefront financing form values (FinancingPage) shown as the customer chose them.
const employmentLabels: Record<string, string> = {
  employed: 'Employed', 'self-employed': 'Self-employed', retired: 'Retired', student: 'Student', other: 'Other',
}
const creditTierLabels: Record<string, string> = {
  'excellent-720-plus': 'Excellent (720+)', 'good-680-719': 'Good (680–719)', 'fair-620-679': 'Fair (620–679)',
  'rebuilding-under-620': 'Rebuilding (<620)', unknown: 'Not sure',
}
export function employmentLabel(value: string | null | undefined, locale: Locale = 'en-US') {
  return value ? (locale === 'pt-BR' && value === 'other' ? 'Outra situação' : financeLabel(locale, employmentLabels[value] || value)) : '-'
}
export function creditTierLabel(value: string | null | undefined, locale: Locale = 'en-US') {
  return value ? financeLabel(locale, creditTierLabels[value] || value) : '-'
}
