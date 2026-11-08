import { translateSchemaLabel, type Locale } from './messages'

/** Localizes common Keystone field validation messages while preserving field labels and values. */
export function localizeValidationMessage(message: string, locale: Locale): string {
  if (locale !== 'pt-BR') return message
  return message
    .replace(/^(.+) is required$/, (_, field: string) => `Preencha o campo “${translateSchemaLabel(locale, field)}”.`)
    .replace(/^(.+) must not be empty$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” não pode ficar vazio.`)
    .replace(/^(.+) is not a valid integer$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ser um número inteiro válido.`)
    .replace(/^(.+) is not a valid BigInt$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ser um número inteiro válido.`)
    .replace(/^(.+) is not a valid float$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ser um número decimal válido.`)
    .replace(/^(.+): Not a valid decimal number$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” deve conter um número decimal válido.`)
    .replace(/^(.+): Invalid decimal format$/, (_, field: string) => `O campo “${translateSchemaLabel(locale, field)}” tem um formato decimal inválido.`)
    .replace(/^(.+) must be greater than or equal to (.+)$/, (_, field: string, value: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ser maior ou igual a ${value}.`)
    .replace(/^(.+) must be less than or equal to (.+)$/, (_, field: string, value: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ser menor ou igual a ${value}.`)
    .replace(/^(.+) must be at least (\d+) characters long$/, (_, field: string, count: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ter pelo menos ${count} caracteres.`)
    .replace(/^(.+) must be no longer than (\d+) characters$/, (_, field: string, count: string) => `O campo “${translateSchemaLabel(locale, field)}” deve ter no máximo ${count} caracteres.`)
    .replace(/^The passwords do not match$/, 'As senhas não coincidem.')
}

export function localizeValidationMessages(messages: string[], locale: Locale): string[] {
  return messages.map(message => localizeValidationMessage(message, locale))
}
