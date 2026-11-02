import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import type { Role as PrismaRole } from '../../server/generated/prisma/client'
import { assertJobAccess, requireAuth, requirePermission, requireRole } from '../../server/utils/rbac'
import type { AuthUser, Permission, Role } from '../../shared/utils/rbac'
import { PERMISSIONS, canAccessJob, hasPermission, isRole, jobVisibilityWhere } from '../../shared/utils/rbac'

type RolesMatch = [PrismaRole] extends [Role] ? [Role] extends [PrismaRole] ? true : never : never
const rolesMatch: RolesMatch = true

function user(role: Role, id = role.toLowerCase()): AuthUser {
  return { id, email: `${id}@example.com`, name: id, role }
}

function asEvent(auth?: AuthUser): H3Event {
  return { context: { auth } } as unknown as H3Event
}

describe('rbac', () => {
  it('keeps the app roles aligned with the database enum', () => {
    expect(rolesMatch).toBe(true)
  })

  it('recognizes the four roles', () => {
    expect(isRole('TECHNICIAN')).toBe(true)
    expect(isRole('customer')).toBe(false)
  })

  it('gives super admin every permission and keeps technicians off finance', () => {
    const permissions = Object.keys(PERMISSIONS) as Permission[]
    for (const permission of permissions) {
      expect(hasPermission('SUPER_ADMIN', permission)).toBe(true)
    }
    expect(hasPermission('OWNER', 'invoices.finalize')).toBe(true)
    expect(hasPermission('OWNER', 'payments.confirm')).toBe(true)
    expect(hasPermission('DISPATCHER', 'schedule.manage')).toBe(true)
    expect(hasPermission('DISPATCHER', 'customers.manage')).toBe(true)
    expect(hasPermission('TECHNICIAN', 'customers.manage')).toBe(false)
    expect(hasPermission('OWNER', 'customers.manage')).toBe(true)
    expect(hasPermission('DISPATCHER', 'invoices.finalize')).toBe(false)
    expect(hasPermission('DISPATCHER', 'payments.confirm')).toBe(false)
    expect(hasPermission('TECHNICIAN', 'work.record')).toBe(true)
    expect(hasPermission('TECHNICIAN', 'jobs.read.all')).toBe(false)
    expect(hasPermission('TECHNICIAN', 'audit.read')).toBe(false)
    expect(hasPermission('OWNER', 'settings.manage')).toBe(false)
    expect(hasPermission('OWNER', 'decisions.manage')).toBe(true)
    expect(hasPermission('DISPATCHER', 'decisions.manage')).toBe(false)
    expect(hasPermission('TECHNICIAN', 'decisions.manage')).toBe(false)
  })

  it('limits technicians to assigned or shared jobs', () => {
    const tech = user('TECHNICIAN', 'tech-1')
    const owner = user('OWNER')
    expect(canAccessJob(tech, { assignedToId: 'tech-1', collaboratorIds: [] })).toBe(true)
    expect(canAccessJob(tech, { assignedToId: 'other', collaboratorIds: ['tech-1'] })).toBe(true)
    expect(canAccessJob(tech, { assignedToId: 'other', collaboratorIds: [] })).toBe(false)
    expect(canAccessJob(owner, { assignedToId: null, collaboratorIds: [] })).toBe(true)
    expect(jobVisibilityWhere(tech)).toEqual({
      OR: [
        { assignedToId: 'tech-1' },
        { collaborators: { some: { id: 'tech-1' } } },
      ],
    })
    expect(jobVisibilityWhere(owner)).toEqual({})
  })

  it('rejects missing and insufficient sessions', () => {
    expect(statusOf(() => requireAuth(asEvent()))).toBe(401)
    expect(statusOf(() => requireRole(asEvent(user('TECHNICIAN')), 'OWNER'))).toBe(403)
    expect(requireRole(asEvent(user('OWNER')), 'OWNER', 'SUPER_ADMIN').role).toBe('OWNER')
    expect(statusOf(() => requirePermission(asEvent(user('TECHNICIAN')), 'audit.read'))).toBe(403)
    expect(requirePermission(asEvent(user('OWNER')), 'audit.read').role).toBe('OWNER')
    expect(statusOf(() => assertJobAccess(asEvent(user('TECHNICIAN', 'tech-1')), {
      assignedToId: 'other',
      collaboratorIds: [],
    }))).toBe(403)
    expect(assertJobAccess(asEvent(user('TECHNICIAN', 'tech-1')), {
      assignedToId: 'tech-1',
      collaboratorIds: [],
    }).id).toBe('tech-1')
  })
})

function statusOf(run: () => unknown): number | undefined {
  try {
    run()
    return undefined
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}
