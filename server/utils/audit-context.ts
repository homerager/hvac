import { AsyncLocalStorage } from 'node:async_hooks'

/** Who is making the current change, and the business name for it. */
export type AuditContext = {
  actorId?: string | null
  ipAddress?: string | null
  reason?: string | null
  /** Replaces the automatic `entity.operation` action for writes in this scope. */
  action?: string | null
}

const storage = new AsyncLocalStorage<AuditContext>()

const KEYS = ['actorId', 'ipAddress', 'reason', 'action'] as const

function merge(parent: AuditContext | undefined, patch: AuditContext): AuditContext {
  const next: AuditContext = { ...parent }
  for (const key of KEYS) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }
  return next
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore()
}

/** Binds the context for the rest of the current request. Prefer `withAudit` in services and tests. */
export function bindAuditContext(patch: AuditContext): void {
  storage.enterWith(merge(storage.getStore(), patch))
}

export function withAudit<T>(patch: AuditContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(merge(storage.getStore(), patch), fn)
}
