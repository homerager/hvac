import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { Prisma } from '../../server/generated/prisma/client'
import { getDecisions, recordSignOff, saveDecision } from '../../server/services/decisions'
import { hashPassword } from '../../server/services/password'
import { usePrisma } from '../../server/utils/prisma'
import {
  DECISION_IDS,
  PAYMENT_METHODS,
  REQUIREMENTS_DRAFT,
  latestSignatureDate,
  type DecisionId,
} from '../../shared/utils/decisions'
import type { Role } from '../../shared/utils/rbac'

const describeDb = process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD ? describe : describe.skip

describeDb('client decisions', () => {
  const email = `decisions-${randomUUID()}@example.com`
  const startedAt = new Date(Date.now() - 1000)
  let userId = ''
  let originalDecisions: StoredSetting | null = null
  let originalServiceCall: StoredSetting | null = null
  let originalInvoice: StoredSetting | null = null
  let decisionsExisted = false
  let serviceCallExisted = false
  let invoiceExisted = false

  afterAll(async () => {
    const prisma = usePrisma()
    await restoreSetting(prisma, 'client-decisions', originalDecisions, decisionsExisted)
    await restoreSetting(prisma, 'service-call', originalServiceCall, serviceCallExisted)
    await restoreSetting(prisma, 'invoice', originalInvoice, invoiceExisted)
    await prisma.auditLog.deleteMany({
      where: { createdAt: { gte: startedAt }, actorId: userId || undefined },
    })
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    await prisma.$disconnect()
  })

  it('records answers, blocks an early signature, and clears the signature when an answer changes', async () => {
    const prisma = usePrisma()
    const [decisionsRow, serviceCallRow, invoiceRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'client-decisions' } }),
      prisma.setting.findUnique({ where: { key: 'service-call' } }),
      prisma.setting.findUnique({ where: { key: 'invoice' } }),
    ])
    decisionsExisted = Boolean(decisionsRow)
    serviceCallExisted = Boolean(serviceCallRow)
    invoiceExisted = Boolean(invoiceRow)
    originalDecisions = snapshot(decisionsRow)
    originalServiceCall = snapshot(serviceCallRow)
    originalInvoice = snapshot(invoiceRow)

    const user = await prisma.user.create({
      data: {
        email,
        name: 'Decisions Admin',
        role: 'SUPER_ADMIN',
        passwordHash: await hashPassword('ServoraDemo!'),
      },
    })
    userId = user.id

    const open = await getDecisions()
    expect(open.progress.answered).toBeGreaterThanOrEqual(0)

    const approval = await saveDecision('invoice-approval', {
      requireOwnerApproval: 'yes',
      fallbackRole: 'DISPATCHER',
    }, user.id)
    expect(approval.decisions.find(item => item.id === 'invoice-approval')?.summary).toMatch(/Dispatcher acts/)
    const invoiceAfterApproval = await prisma.setting.findUnique({ where: { key: 'invoice' } })
    expect(invoiceAfterApproval?.value).toMatchObject({
      requireOwnerApproval: true,
      approvalFallbackRole: 'DISPATCHER',
    })

    await expect(recordSignOff(signOffBody(), user.id)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Answer all nine decisions before recording a signature.',
    })

    for (const id of DECISION_IDS) {
      if (id === 'invoice-approval') continue
      await saveDecision(id, sampleInput(id), user.id)
    }

    const serviceCall = await prisma.setting.findUnique({ where: { key: 'service-call' } })
    expect(serviceCall?.value).toMatchObject({
      amountCents: 8950,
      includedMinutes: 30,
      exemptContractCustomers: true,
      waiveRoles: ['OWNER'],
    })
    const invoice = await prisma.setting.findUnique({ where: { key: 'invoice' } })
    expect(invoice?.value).toMatchObject({
      requireOwnerApproval: true,
      approvalFallbackRole: 'DISPATCHER',
      numberFormat: 'INV-{YYYY}-{SEQ}',
      paymentTermsDays: 15,
    })

    const signed = await recordSignOff(signOffBody(), user.id)
    expect(signed.liveReady).toBe(true)
    expect(signed.signOff?.signerName).toBe('Pilot Owner')
    const signAudit = await prisma.auditLog.findFirst({
      where: { actorId: user.id, action: 'decision.sign' },
      orderBy: { createdAt: 'desc' },
    })
    expect(signAudit?.entityId).toBe('client-decisions')
    expect(signAudit?.reason).toMatch(/Pilot Owner/)

    const repeated = await saveDecision('invoice-approval', {
      requireOwnerApproval: 'yes',
      fallbackRole: 'DISPATCHER',
    }, user.id)
    expect(repeated.signed).toBe(true)

    const changed = await saveDecision('service-call', {
      ...sampleInput('service-call') as Record<string, unknown>,
      amount: '10',
    }, user.id)
    expect(changed.signed).toBe(false)
    expect(changed.voidedSignOffs[0]?.voidReason).toMatch(/Service call changed/)
    const waived = await prisma.setting.findUnique({ where: { key: 'service-call' } })
    expect(waived?.value).toMatchObject({ amountCents: 1000 })

    const reopened = await saveDecision('import', { reopen: true }, user.id)
    expect(reopened.decisions.find(item => item.id === 'import')?.answered).toBe(false)
    expect(reopened.liveReady).toBe(false)

    await expect(saveDecision('not-a-decision', {}, user.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(saveDecision('invoice-approval', { requireOwnerApproval: 'yes', fallbackRole: '' }, user.id)).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

type StoredSetting = { value: Prisma.JsonValue, updatedById: string | null }

function snapshot(row: { value: Prisma.JsonValue, updatedById: string | null } | null): StoredSetting | null {
  if (!row) return null
  return { value: row.value, updatedById: row.updatedById }
}

async function restoreSetting(
  prisma: ReturnType<typeof usePrisma>,
  key: string,
  original: StoredSetting | null,
  existed: boolean,
): Promise<void> {
  if (!existed) {
    await prisma.setting.delete({ where: { key } }).catch(() => undefined)
    return
  }
  if (!original) return
  await prisma.setting.update({
    where: { key },
    data: { value: original.value as Prisma.InputJsonValue, updatedById: original.updatedById },
  })
}

function signOffBody() {
  return {
    signerName: 'Pilot Owner',
    signerTitle: 'Owner',
    signedOn: latestSignatureDate(new Date()),
    documentTitle: REQUIREMENTS_DRAFT.title,
    documentDate: REQUIREMENTS_DRAFT.date,
    signedCopyRef: 'Signed PDF kept by the owner.',
    attested: true,
  }
}

function sampleInput(id: DecisionId): unknown {
  switch (id) {
    case 'invoice-approval':
      return { requireOwnerApproval: 'yes', fallbackRole: 'DISPATCHER' }
    case 'payment-rights':
      return { secondApproval: 'no', secondApproverRoles: [], methods: blankMethods(['OWNER']) }
    case 'service-call':
      return {
        amount: '89.50',
        includedMinutes: '30',
        exemptContractCustomers: 'yes',
        waiveRoles: ['OWNER'],
        exceptions: 'No charge for warranty callbacks.',
      }
    case 'tax-and-numbering':
      return {
        nyRate: '8.875',
        nyRule: 'New York City combined rate authorized by the accountant.',
        njRate: '6.625',
        njRule: 'New Jersey state rate authorized by the accountant.',
        paymentTermsDays: '15',
        numberFormat: 'INV-{YYYY}-{SEQ}',
      }
    case 'delivery':
      return { channel: 'email', provider: 'resend', providerName: '', reminders: 'scheduled', reminderDays: '7, 14' }
    case 'check-photos':
      return { viewerRoles: ['SUPER_ADMIN', 'OWNER'], retention: 'days', retentionDays: '365' }
    case 'import':
      return { include: [], notes: 'Nothing is imported for the pilot.' }
    case 'offline':
      return {
        scope: 'online_only',
        mustWork: 'Nothing is promised offline.',
        canWait: 'Every save waits for a successful connection.',
      }
    case 'super-admin':
      return {
        installation: 'yes',
        users: 'yes',
        customers: 'no',
        scheduling: 'no',
        allJobs: 'yes',
        workRecords: 'no',
        pricing: 'no',
        invoiceApproval: 'no',
        invoiceFinalize: 'no',
        payments: 'no',
        audit: 'yes',
        notes: '',
      }
  }
}

function blankMethods(roles: Role[]) {
  const actions = { record: roles, confirm: [...roles], void: [...roles], refund: [...roles] }
  return Object.fromEntries(PAYMENT_METHODS.map(method => [method, { record: [...roles], confirm: actions.confirm, void: actions.void, refund: actions.refund }]))
}
