import type { H3Event } from 'h3'
import { createError } from 'h3'
import { canAccessJob, hasPermission, type AuthUser, type JobAccess, type Permission, type Role } from '../../shared/utils/rbac'

export function requireAuth(event: H3Event): AuthUser {
  const auth = event.context.auth
  if (!auth) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required.',
    })
  }
  return auth
}

export function requireRole(event: H3Event, ...roles: Role[]): AuthUser {
  const auth = requireAuth(event)
  if (!roles.includes(auth.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this.',
    })
  }
  return auth
}

export function requirePermission(event: H3Event, permission: Permission): AuthUser {
  const auth = requireAuth(event)
  if (!hasPermission(auth.role, permission)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this.',
    })
  }
  return auth
}

export function assertJobAccess(event: H3Event, job: JobAccess): AuthUser {
  const auth = requireAuth(event)
  if (!canAccessJob(auth, job)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this job.',
    })
  }
  return auth
}
