/** Money is stored as integer cents (USD). */
export type Cents = number

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100)
}

export function formatCents(cents: Cents, currency = 'USD', locale = 'en-US'): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`Expected integer cents, got ${cents}`)
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
