import { describe, expect, it } from 'vitest'
import { LOGIN_RATE_LIMIT_MESSAGE, loginSchema } from '../../shared/utils/login-schema'

describe('login schema', () => {
  it('treats spaced and mixed-case email as the same address', () => {
    const parsed = loginSchema.parse({ email: ' User@X.com ', password: 'a' })
    expect(parsed.email).toBe('user@x.com')
  })

  it('rejects an email longer than 254 characters before any password work', () => {
    const email = `${'a'.repeat(250)}@x.com`
    expect(email.length).toBeGreaterThan(254)
    expect(loginSchema.safeParse({ email, password: 'a' }).success).toBe(false)
  })

  it('accepts a 1024-character password and rejects empty or longer ones', () => {
    expect(loginSchema.safeParse({ email: 'user@x.com', password: 'a'.repeat(1024) }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'user@x.com', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'user@x.com', password: 'a'.repeat(1025) }).success).toBe(false)
    expect(loginSchema.safeParse({ email: '   ', password: 'a' }).success).toBe(false)
  })

  it('uses one rate-limit message', () => {
    expect(LOGIN_RATE_LIMIT_MESSAGE).toBe('Too many sign-in attempts. Try again later.')
  })
})
