import { describe, expect, it } from 'vitest'
import { parseServerEnv } from '../../server/utils/env'

describe('parseServerEnv', () => {
  const sessionPassword = 'dev-only-change-me-please-32-chars-min'

  it('accepts a postgres DATABASE_URL', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://hvac:hvac@localhost:5432/hvac',
      NUXT_SESSION_PASSWORD: sessionPassword,
    })
    expect(env.DATABASE_URL).toContain('localhost')
    expect(env.NODE_ENV).toBe('development')
    expect(env.NUXT_SESSION_PASSWORD).toBe(sessionPassword)
  })

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => parseServerEnv({ NUXT_SESSION_PASSWORD: sessionPassword })).toThrow(/DATABASE_URL/)
    expect(() => parseServerEnv({
      DATABASE_URL: 'mysql://localhost/db',
      NUXT_SESSION_PASSWORD: sessionPassword,
    })).toThrow(/DATABASE_URL/)
  })

  it('rejects a session password shorter than 32 characters', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://hvac:hvac@localhost:5432/hvac',
      NUXT_SESSION_PASSWORD: 'too-short',
    })).toThrow(/NUXT_SESSION_PASSWORD/)
  })
})
