import { describe, expect, it } from 'vitest'
import { Prisma } from '../../server/generated/prisma/client'
import { changedKeys, planAudit, toAuditJson } from '../../server/services/audit-log'

describe('audit log snapshots', () => {
  it('redacts password hashes and serializes dates and decimals', () => {
    const json = toAuditJson({
      passwordHash: 'secret-hash',
      at: new Date('2026-10-29T12:00:00.000Z'),
      quantity: new Prisma.Decimal('2.50'),
      empty: null,
    })
    expect(json).toEqual({
      passwordHash: '[redacted]',
      at: '2026-10-29T12:00:00.000Z',
      quantity: '2.5',
      empty: null,
    })
  })

  it('ignores a login timestamp touch and keeps a role change', () => {
    const before = { id: 'user-1', role: 'TECHNICIAN', passwordHash: 'hash', lastLoginAt: null, updatedAt: 't0' }
    const login = { ...before, lastLoginAt: 't1', updatedAt: 't1' }
    expect(planAudit({ model: 'User', operation: 'update', before, result: login })).toBeNull()

    const promoted = { ...before, role: 'OWNER', updatedAt: 't1' }
    const planned = planAudit({
      model: 'User',
      operation: 'update',
      before,
      result: promoted,
      context: { actorId: 'owner-1', action: 'user.role_change', reason: 'Coverage', ipAddress: '127.0.0.1' },
    })
    expect(planned).toMatchObject({
      actorId: 'owner-1',
      action: 'user.role_change',
      entityType: 'User',
      entityId: 'user-1',
      reason: 'Coverage',
      ipAddress: '127.0.0.1',
    })
    expect(planned?.before).toMatchObject({ role: 'TECHNICIAN', passwordHash: '[redacted]' })
    expect(planned?.after).toMatchObject({ role: 'OWNER', passwordHash: '[redacted]' })
    expect(changedKeys(before, promoted)).toEqual(['role', 'updatedAt'])
  })

  it('names invoice creates and uses a setting key as the entity id', () => {
    const created = planAudit({
      model: 'Invoice',
      operation: 'create',
      before: null,
      result: { id: 'inv-1', totalCents: 1000 },
    })
    expect(created).toMatchObject({ action: 'invoice.create', entityType: 'Invoice', entityId: 'inv-1' })

    const setting = planAudit({
      model: 'Setting',
      operation: 'update',
      before: { key: 'branding', value: { theme: 'blue' } },
      result: { key: 'branding', value: { theme: 'slate' } },
    })
    expect(setting).toMatchObject({ action: 'setting.update', entityId: 'branding' })
  })

  it('skips batch writes that change nothing and records a delete', () => {
    expect(planAudit({
      model: 'Payment',
      operation: 'updateMany',
      before: [],
      result: { count: 0 },
    })).toBeNull()

    const removed = planAudit({
      model: 'Payment',
      operation: 'delete',
      before: { id: 'pay-1', amountCents: 500 },
      result: { id: 'pay-1', amountCents: 500 },
    })
    expect(removed).toMatchObject({ action: 'payment.delete', entityId: 'pay-1' })
    expect(removed?.after).toBe(Prisma.DbNull)
    expect(removed?.before).toMatchObject({ amountCents: 500 })
  })
})
