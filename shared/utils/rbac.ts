// Server-enforced access for BR-15. The API never trusts the role stored in the session cookie.
//
// The client's exact Super Admin rights and per-method payment rights are recorded in the
// client-decisions setting. This matrix stays the enforcement point: a recorded answer does
// not change access until that signed decision is applied here.
// Payment record / confirm / void stay with the owner and super admin until then.

export const ROLES = ['SUPER_ADMIN', 'OWNER', 'DISPATCHER', 'TECHNICIAN'] as const

export type Role = (typeof ROLES)[number]

export type AuthUser = {
  id: string
  email: string
  name: string
  role: Role
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  OWNER: 'Owner',
  DISPATCHER: 'Dispatcher',
  TECHNICIAN: 'Technician',
}

export const PERMISSIONS = {
  'settings.manage': ['SUPER_ADMIN'],
  'users.manage': ['SUPER_ADMIN', 'OWNER'],
  'users.read': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'customers.manage': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'requests.manage': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'schedule.manage': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'jobs.read.all': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'work.record': ['SUPER_ADMIN', 'OWNER', 'TECHNICIAN'],
  'work.correct': ['SUPER_ADMIN', 'OWNER'],
  'prices.manage': ['SUPER_ADMIN', 'OWNER'],
  'invoices.read': ['SUPER_ADMIN', 'OWNER', 'DISPATCHER'],
  'invoices.approve': ['SUPER_ADMIN', 'OWNER'],
  'invoices.finalize': ['SUPER_ADMIN', 'OWNER'],
  'payments.record': ['SUPER_ADMIN', 'OWNER'],
  'payments.confirm': ['SUPER_ADMIN', 'OWNER'],
  'payments.void': ['SUPER_ADMIN', 'OWNER'],
  'audit.read': ['SUPER_ADMIN', 'OWNER'],
  'decisions.manage': ['SUPER_ADMIN', 'OWNER'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

export type JobAccess = {
  assignedToId: string | null
  collaboratorIds: readonly string[]
}

/** Extra `where` for job queries. Empty for roles that can read every job. */
export function jobVisibilityWhere(user: Pick<AuthUser, 'id' | 'role'>): {
  OR?: Array<{ assignedToId: string } | { collaborators: { some: { id: string } } }>
} {
  if (hasPermission(user.role, 'jobs.read.all')) return {}
  return {
    OR: [
      { assignedToId: user.id },
      { collaborators: { some: { id: user.id } } },
    ],
  }
}

/** Technicians only see jobs assigned to them or explicitly shared (BR-15). */
export function canAccessJob(user: Pick<AuthUser, 'id' | 'role'>, job: JobAccess): boolean {
  if (hasPermission(user.role, 'jobs.read.all')) return true
  return job.assignedToId === user.id || job.collaboratorIds.includes(user.id)
}
