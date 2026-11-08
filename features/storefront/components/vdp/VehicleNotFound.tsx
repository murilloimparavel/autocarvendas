import Link from 'next/link'
import { Container } from '../Container'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function VehicleNotFound() {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <Container className="py-[var(--sf-space-2xl)]">
      <div className="sf-well flex flex-col items-start gap-5 p-6 md:p-8">
        <div>
          <h1 className="sf-title-line sf-heading text-[length:var(--sf-text-xl)]">
            <span className="sf-dot" aria-hidden="true" />
            {pt ? 'Veículo não encontrado' : 'Vehicle not found'}
          </h1>
          <p className="sf-muted mt-2 pl-4">{pt ? 'Este veículo não está mais disponível.' : 'This vehicle is no longer available.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory" className="sf-btn sf-btn-primary">{pt ? 'Voltar ao estoque' : 'Back to inventory'}</Link>
        </div>
      </div>
    </Container>
  )
}
