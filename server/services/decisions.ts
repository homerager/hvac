import { createError } from 'h3'
import type { Prisma } from '../generated/prisma/client'
import {
  DECISION_CATALOG,
  emptyDecisionRegister,
  invoiceSettingValue,
  isDecisionId,
  latestSignatureDate,
  parseDecisionInput,
  parseDecisionRegister,
  parseSignOffInput,
  serviceCallSettingValue,
  toDecisionsResponse,
  withDecisionAnswer,
  withDecisionReopened,
  withSignOff,
  type DecisionRegister,
  type DecisionsResponse,
} from '../../shared/utils/decisions'
import { withAudit, bindAuditContext } from '../utils/audit-context'
import { usePrisma, type AppPrismaClient } from '../utils/prisma'

const DECISIONS_KEY = 'client-decisions'
const SERVICE_CALL_KEY = 'service-call'
const INVOICE_KEY = 'invoice'
const SETTING_KEYS = [DECISIONS_KEY, SERVICE_CALL_KEY, INVOICE_KEY] as const

type Tx = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]

type SettingRow = { key: string, value: Prisma.JsonValue }

/** The nine client decisions and whether a requirements version has been signed. */
export async function getDecisions(): Promise<DecisionsResponse> {
  const row = await usePrisma().setting.findUnique({ where: { key: DECISIONS_KEY } })
  return toDecisionsResponse(parseDecisionRegister(row?.value))
}

export async function saveDecision(id: string, body: unknown, actorId: string): Promise<DecisionsResponse> {
  if (!isDecisionId(id)) {
    throw createError({ statusCode: 404, statusMessage: 'That decision is not on the list.' })
  }
  const reopen = isRecord(body) && body.reopen === true
  if (!reopen) {
    const parsed = parseDecisionInput(id, body)
    if (!parsed.ok) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Check this decision and try again.',
        data: { fields: parsed.fields },
      })
    }
  }

  return changeRegister(actorId, (register, at) => {
    if (reopen) return withDecisionReopened(register, id, at)
    const parsed = parseDecisionInput(id, body)
    if (!parsed.ok) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Check this decision and try again.',
        data: { fields: parsed.fields },
      })
    }
    return withDecisionAnswer(register, id, parsed.answer, actorId, at)
  }, (result) => {
    if (reopen) return { action: 'decision.reopen', reason: result.voidReason ?? `${DECISION_CATALOG[id].short} reopened.` }
    return { action: 'decision.answer', reason: result.voidReason ?? `${DECISION_CATALOG[id].short} answered.` }
  })
}

export async function recordSignOff(body: unknown, actorId: string): Promise<DecisionsResponse> {
  const parsed = parseSignOffInput(body, latestSignatureDate())
  if (!parsed.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Check the signature details and try again.',
      data: { fields: parsed.fields },
    })
  }

  return changeRegister(actorId, (register, at) => {
    const signed = withSignOff(register, parsed.input, actorId, at)
    if (!signed.ok) {
      throw createError({ statusCode: signed.statusCode, statusMessage: signed.message })
    }
    return { register: signed.register, changed: true, voidReason: null }
  }, () => ({
    action: 'decision.sign',
    reason: `Requirements signed by ${parsed.input.signerName}.`,
  }), false)
}

async function changeRegister(
  actorId: string,
  apply: (register: DecisionRegister, at: string) => { register: DecisionRegister, changed: boolean, voidReason: string | null },
  audit: (result: { voidReason: string | null }) => { action: string, reason: string },
  syncSettings = true,
): Promise<DecisionsResponse> {
  const at = new Date().toISOString()
  return withAudit({ actorId }, () => usePrisma().$transaction(async (tx) => {
    await ensureDecisionRow(tx)
    await lockSettings(tx)
    const rows = await tx.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } })
    const current = parseDecisionRegister(rowValue(rows, DECISIONS_KEY))
    const result = apply(current, at)
    if (!result.changed) return toDecisionsResponse(current)

    const { action, reason } = audit(result)
    bindAuditContext({ actorId, action, reason })
    await tx.setting.upsert({
      where: { key: DECISIONS_KEY },
      create: { key: DECISIONS_KEY, value: asJson(result.register), updatedById: actorId },
      update: { value: asJson(result.register), updatedById: actorId },
    })
    bindAuditContext({ action: null, reason: null })
    if (syncSettings) await syncDerivedSettings(tx, result.register, rows, actorId)
    return toDecisionsResponse(result.register)
  }))
}

async function ensureDecisionRow(tx: Tx): Promise<void> {
  await tx.setting.upsert({
    where: { key: DECISIONS_KEY },
    create: { key: DECISIONS_KEY, value: asJson(emptyDecisionRegister()) },
    update: {},
  })
}

async function lockSettings(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT key FROM "Setting" WHERE key IN ('client-decisions', 'service-call', 'invoice') FOR UPDATE`
}

async function syncDerivedSettings(tx: Tx, register: DecisionRegister, rows: SettingRow[], actorId: string): Promise<void> {
  await syncSetting(tx, SERVICE_CALL_KEY, serviceCallSettingValue(register, rowValue(rows, SERVICE_CALL_KEY)), actorId)
  await syncSetting(tx, INVOICE_KEY, invoiceSettingValue(register, rowValue(rows, INVOICE_KEY)), actorId)
}

async function syncSetting(tx: Tx, key: string, value: Record<string, unknown>, actorId: string): Promise<void> {
  const current = await tx.setting.findUnique({ where: { key } })
  if (current && JSON.stringify(current.value) === JSON.stringify(value)) return
  await tx.setting.upsert({
    where: { key },
    create: { key, value: asJson(value), updatedById: actorId },
    update: { value: asJson(value), updatedById: actorId },
  })
}

function rowValue(rows: SettingRow[], key: string): Prisma.JsonValue | undefined {
  return rows.find(row => row.key === key)?.value
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
