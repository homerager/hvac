import { describe, expect, it } from 'vitest'
import { formatCents, toCents } from '../../shared/utils/money'

describe('money', () => {
  it('converts dollars to integer cents', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('formats cents as USD', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(-500)).toBe('-$5.00')
  })

  it('rejects fractional cents', () => {
    expect(() => formatCents(10.5)).toThrow(TypeError)
  })
})
