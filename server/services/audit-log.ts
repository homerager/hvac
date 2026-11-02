import { Prisma } from '../generated/prisma/client'
import { getAuditContext, withAudit, type AuditContext } from '../utils/audit-context'

export { withAudit }

/**
 * Append-only audit of prices, invoices, payments, roles, and record corrections (BR-15).
 * Installed as a Prisma Client extension so every write is recorded, including ones that
 * bypass a single service function. Password hashes are never stored.
 */

const MODEL_ACTION: Record<string, string> = {
  User: 'user',
  Invoice: 'invoice',
  InvoiceLine: 'invoice_line',
  InvoiceAdjustment: 'invoice_adjustment',
  Payment: 'payment',
  WorkEntry: 'work_entry',
  WorkEntryLine: 'work_entry_line',
  Setting: 'setting',
}

const WRITE_OPERATIONS = new Set([
  'create',
  'update',
  'upsert',
  'delete',
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
])

const SINGLE_ROW_UPDATES = new Set(['update', 'upsert'])
const BATCH_COUNT_OPERATIONS = new Set(['createMany', 'updateMany', 'deleteMany'])

type WriteArgs = {
  where?: unknown
  data?: unknown
}

type ItxTransaction = { kind: string }

type QueryPayload = {
  model?: string
  operation: string
  args: WriteArgs
  query: (args: WriteArgs) => Promise<unknown>
  __internalParams?: { transaction?: ItxTransaction }
}

type EngineClient = Prisma.DefaultPrismaClient & {
  _request: (params: {
    model: string
    action: string
    args: unknown
    clientMethod: string
    dataPath: string[]
    jsModelName: string
    transaction?: ItxTransaction
  }) => Promise<unknown>
}

let engine: EngineClient | undefined

/** The unextended client. Its engine owns interactive transactions started by the extended client. */
export function bindAuditEngine(client: Prisma.DefaultPrismaClient) {
  engine = client as EngineClient
}

export function isAuditedWrite(model: string | undefined, operation: string): boolean {
  return Boolean(model && MODEL_ACTION[model] && WRITE_OPERATIONS.has(operation))
}

export function toAuditJson(value: unknown): Prisma.InputJsonValue | null {
  const sanitized = sanitize(value, undefined)
  if (sanitized === null || sanitized === undefined) return null
  return sanitized as Prisma.InputJsonValue
}

export function changedKeys(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const key of keys) {
    if (JSON.stringify(toAuditJson(before[key])) !== JSON.stringify(toAuditJson(after[key]))) {
      changed.push(key)
    }
  }
  return changed
}

export function planAudit(input: {
  model: string
  operation: string
  before: unknown
  result: unknown
  context?: AuditContext
}): Prisma.AuditLogUncheckedCreateInput | null {
  if (!isAuditedWrite(input.model, input.operation)) return null
  if (isEmptyBatch(input.operation, input.result)) return null

  const before = beforeSnapshot(input.operation, input.before)
  const after = afterSnapshot(input.operation, input.result)
  if (isNoiseUpdate(input.model, input.operation, before, after)) return null

  const context = input.context
  const entity = MODEL_ACTION[input.model]
  if (!entity) return null

  return {
    actorId: context?.actorId ?? null,
    action: context?.action || `${entity}.${input.operation}`,
    entityType: input.model,
    entityId: entityIdFor(input.model, before, input.result),
    before: jsonColumn(before),
    after: jsonColumn(after),
    reason: context?.reason ?? null,
    ipAddress: context?.ipAddress ?? null,
  }
}

/** A business event that is not itself a model write. Model writes are logged by the extension. */
export async function recordAudit(entry: {
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  reason?: string | null
  actorId?: string | null
}): Promise<void> {
  const context = getAuditContext()
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: jsonColumn(entry.before ?? null),
    after: jsonColumn(entry.after ?? null),
    reason: entry.reason !== undefined ? entry.reason : (context?.reason ?? null),
    actorId: entry.actorId !== undefined ? entry.actorId : (context?.actorId ?? null),
    ipAddress: context?.ipAddress ?? null,
  }
  const { usePrisma } = await import('../utils/prisma')
  await usePrisma().auditLog.create({ data })
}

export function createAuditExtension() {
  return Prisma.defineExtension({
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations(payload) {
          const { model, operation, args, query } = payload as QueryPayload
          if (!model || !isAuditedWrite(model, operation)) return query(args)

          // Query callbacks are not bound to the client. An open interactive transaction is
          // on the private params, and the unextended client can run the audit insert on it
          // so the row commits or rolls back with the business write.
          const transaction = (payload as QueryPayload).__internalParams?.transaction
          const itx = transaction?.kind === 'itx' ? transaction : undefined
          const before = await readBefore(model, operation, args, itx)
          const result = await query(args)
          const planned = planAudit({
            model,
            operation,
            before,
            result,
            context: getAuditContext(),
          })
          if (planned) await engineRequest('AuditLog', 'create', { data: planned }, itx)
          return result
        },
      },
    },
  })
}

async function readBefore(model: string, operation: string, args: WriteArgs, transaction?: ItxTransaction): Promise<unknown> {
  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') return null
  if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
    if (args.where === undefined) return null
    return engineRequest(model, 'findUnique', { where: args.where }, transaction)
  }
  return engineRequest(model, 'findMany', args.where === undefined ? {} : { where: args.where }, transaction)
}

async function engineRequest(model: string, action: string, args: unknown, transaction?: ItxTransaction): Promise<unknown> {
  if (!engine) throw new Error('Audit log is not attached to a Prisma client')
  const jsModelName = delegateKey(model)
  if (transaction) {
    return engine._request({
      model,
      action,
      args,
      clientMethod: `${jsModelName}.${action}`,
      dataPath: [],
      jsModelName,
      transaction,
    })
  }
  const delegate = (engine as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>)[jsModelName]
  const run = delegate?.[action]
  if (!run) throw new Error(`Prisma client has no ${jsModelName}.${action}`)
  return run(args)
}

function beforeSnapshot(operation: string, before: unknown): unknown {
  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') return null
  return before ?? null
}

function afterSnapshot(operation: string, result: unknown): unknown {
  if (operation === 'delete' || operation === 'deleteMany') return null
  if (BATCH_COUNT_OPERATIONS.has(operation)) {
    return { count: isRecord(result) && typeof result.count === 'number' ? result.count : 0 }
  }
  return result ?? null
}

function isEmptyBatch(operation: string, result: unknown): boolean {
  if (BATCH_COUNT_OPERATIONS.has(operation)) {
    return isRecord(result) && result.count === 0
  }
  if (operation === 'createManyAndReturn' || operation === 'updateManyAndReturn') {
    return Array.isArray(result) && result.length === 0
  }
  return false
}

function isNoiseUpdate(model: string, operation: string, before: unknown, after: unknown): boolean {
  if (!SINGLE_ROW_UPDATES.has(operation) || !isRecord(before) || !isRecord(after)) return false
  const changed = changedKeys(before, after)
  if (changed.length === 0 || changed.every(key => key === 'updatedAt')) return true
  return model === 'User' && changed.every(key => key === 'updatedAt' || key === 'lastLoginAt')
}

function entityIdFor(model: string, before: unknown, result: unknown): string {
  const idField = model === 'Setting' ? 'key' : 'id'
  const single = readField(result, idField) ?? readField(before, idField)
  if (single) return single
  const rows = Array.isArray(before) ? before : Array.isArray(result) ? result : []
  const ids = rows
    .map(row => readField(row, idField))
    .filter((id): id is string => Boolean(id))
  if (ids.length === 0) return 'many'
  if (ids.length <= 20) return ids.join(',')
  return `${ids.slice(0, 20).join(',')}…`
}

function readField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined
  const fieldValue = value[field]
  return typeof fieldValue === 'string' && fieldValue.length > 0 ? fieldValue : undefined
}

function jsonColumn(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const json = toAuditJson(value)
  return json === null ? Prisma.DbNull : json
}

function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function sanitize(value: unknown, key: string | undefined): unknown {
  if (key === 'passwordHash') return value == null ? null : '[redacted]'
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => sanitize(item, undefined))
  if (typeof value === 'object') {
    if (isDecimal(value)) return value.toString()
    const out: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (typeof child === 'function' || child === undefined) continue
      out[childKey] = sanitize(child, childKey)
    }
    return out
  }
  return null
}

function isDecimal(value: object): value is { toString: () => string } {
  const decimal = value as { d?: unknown, e?: unknown, s?: unknown, toFixed?: unknown }
  return typeof decimal.toFixed === 'function'
    && Array.isArray(decimal.d)
    && typeof decimal.e === 'number'
    && typeof decimal.s === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
