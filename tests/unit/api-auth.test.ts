import { describe, expect, it } from 'vitest'
import { apiAuthMode } from '../../server/utils/api-auth'

describe('apiAuthMode', () => {
  it('leaves health and login anonymous', () => {
    expect(apiAuthMode('/api/health')).toBe('skip')
    expect(apiAuthMode('/api/auth/login')).toBe('skip')
    expect(apiAuthMode('/')).toBe('skip')
  })

  it('allows session reads and logout without a session', () => {
    expect(apiAuthMode('/api/auth/session')).toBe('optional')
    expect(apiAuthMode('/api/auth/logout')).toBe('optional')
    expect(apiAuthMode('/api/_auth/session')).toBe('optional')
    expect(apiAuthMode('/api/auth/session/')).toBe('optional')
  })

  it('requires a session for every other API route', () => {
    expect(apiAuthMode('/api/audit-logs')).toBe('required')
    expect(apiAuthMode('/api/jobs')).toBe('required')
    expect(apiAuthMode('/api/settings/company', 'PUT')).toBe('required')
    expect(apiAuthMode('/api/settings/logo', 'POST')).toBe('required')
    expect(apiAuthMode('/api/settings/logo', 'DELETE')).toBe('required')
  })

  it('lets anyone read company branding and keeps changes signed in', () => {
    expect(apiAuthMode('/api/branding', 'GET')).toBe('skip')
    expect(apiAuthMode('/api/branding/', 'HEAD')).toBe('skip')
    expect(apiAuthMode('/api/branding/logo', 'GET')).toBe('skip')
    expect(apiAuthMode('/api/branding', 'POST')).toBe('required')
    expect(apiAuthMode('/api/branding/logo', 'DELETE')).toBe('required')
    expect(apiAuthMode('/api/branding')).toBe('required')
  })
})
