import { describe, expect, it } from 'vitest'
import { parseServerEnv } from '../../server/utils/env'

describe('parseServerEnv', () => {
  it('accepts a postgres DATABASE_URL', () => {
    const env = parseServerEnv({ DATABASE_URL: 'postgresql://hvac:hvac@localhost:5432/hvac' })
    expect(env.DATABASE_URL).toContain('localhost')
    expect(env.NODE_ENV).toBe('development')
  })

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/)
    expect(() => parseServerEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/)
  })
})
