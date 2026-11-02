import { describe, expect, it } from 'vitest'
import {
  DECISION_IDS,
  PAYMENT_METHODS,
  REQUIREMENTS_DRAFT,
  centsToDollarInput,
  dollarsToCents,
  emptyDecisionRegister,
  formatPpm,
  isInvoiceNumberFormat,
  isLiveReady,
  latestSignatureDate,
  parseDecisionInput,
  parseDecisionRegister,
  parseSignOffInput,
  percentToPpm,
  toDecisionsResponse,
  withDecisionAnswer,
  withDecisionReopened,
  withSignOff,
  type DecisionId,
} from '../../shared/utils/decisions'
import type { Role } from '../../shared/utils/rbac'

const actor = '0192f000-0000-7000-8000-000000000099'
const at = '2026-11-02T12:00:00.000Z'
const latest = '2026-11-03'

describe('decision values', () => {
  it('stores tax percents exactly and dollar amounts as cents', () => {
    expect(percentToPpm('8.875')).toBe(88_750)
    expect(percentToPpm('6.625')).toBe(66_250)
    expect(formatPpm(88_750)).toBe('8.875')
    expect(formatPpm(66_250)).toBe('6.625')
    expect(percentToPpm('8.87555')).toBeNull()
    expect(dollarsToCents('89.50')).toBe(8950)
    expect(dollarsToCents('89.5')).toBe(8950)
    expect(centsToDollarInput(8950)).toBe('89.50')
    expect(dollarsToCents('10000.01')).toBeNull()
    expect(isInvoiceNumberFormat('INV-{YYYY}-{SEQ}')).toBe(true)
    expect(isInvoiceNumberFormat('INV-{SEQ}-{SEQ}')).toBe(false)
    expect(isInvoiceNumberFormat('INV-1001')).toBe(false)
  })

  it('keeps an empty register unsigned', () => {
    const register = emptyDecisionRegister()
    const view = toDecisionsResponse(register)
    expect(view.progress).toEqual({ answered: 0, total: 9 })
    expect(view.signed).toBe(false)
    expect(view.liveReady).toBe(false)
    expect(view.draft).toEqual(REQUIREMENTS_DRAFT)
    expect(isLiveReady(register)).toBe(false)
    expect(withSignOff(register, signOffInput(), actor, at).ok).toBe(false)
  })

  it('rejects an invoice answer that does not name a fallback', () => {
    const parsed = parseDecisionInput('invoice-approval', { requireOwnerApproval: 'yes', fallbackRole: '' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.fields.fallbackRole).toBe('Choose who acts when the owner is unavailable.')
  })

  it('requires a second approver only when second approval is on', () => {
    const parsed = parseDecisionInput('payment-rights', {
      secondApproval: 'yes',
      secondApproverRoles: [],
      methods: blankMethods(['OWNER']),
    })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.fields.secondApproverRoles).toBe('Choose who gives the second approval.')
  })

  it('round-trips every answer and voids a signature when one changes', () => {
    let register = emptyDecisionRegister()
    for (const id of DECISION_IDS) {
      const parsed = parseDecisionInput(id, sampleInput(id))
      expect(parsed.ok, id).toBe(true)
      if (!parsed.ok) continue
      register = withDecisionAnswer(register, id, parsed.answer, actor, at).register
    }
    expect(toDecisionsResponse(register).progress.answered).toBe(9)

    const signed = withSignOff(register, signOffInput(), actor, at)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    expect(isLiveReady(signed.register)).toBe(true)

    const restored = parseDecisionRegister(JSON.parse(JSON.stringify(signed.register)))
    expect(restored.signOff?.signerName).toBe('Pilot Owner')
    expect(restored.decisions['tax-and-numbering'].answer).toEqual(signed.register.decisions['tax-and-numbering'].answer)

    const changed = withDecisionAnswer(
      signed.register,
      'service-call',
      { ...signed.register.decisions['service-call'].answer!, amountCents: 1000 },
      actor,
      at,
    )
    expect(changed.voidReason).toMatch(/Service call changed/)
    expect(changed.register.signOff).toBeNull()
    expect(changed.register.voidedSignOffs).toHaveLength(1)

    const reopened = withDecisionReopened(signed.register, 'import', at)
    expect(reopened.register.decisions.import.answer).toBeNull()
    expect(reopened.register.signOff).toBeNull()

    const same = withDecisionAnswer(signed.register, 'import', signed.register.decisions.import.answer!, actor, at)
    expect(same.changed).toBe(false)
    expect(same.register.signOff).not.toBeNull()
  })

  it('rejects a signature dated before the draft or in the future', () => {
    const early = parseSignOffInput({ ...signOffBody(), documentDate: '2026-10-25' }, latest)
    expect(early.ok).toBe(false)
    if (!early.ok) expect(early.fields.documentDate).toMatch(/October 26, 2026/)

    const future = parseSignOffInput({ ...signOffBody(), signedOn: '2026-11-04' }, latest)
    expect(future.ok).toBe(false)
    if (!future.ok) expect(future.fields.signedOn).toMatch(/future/)

    expect(parseSignOffInput({ ...signOffBody(), attested: false }, latest).ok).toBe(false)
    expect(latestSignatureDate(new Date('2026-11-02T00:00:00.000Z'))).toBe('2026-11-03')
  })
})

function blankMethods(roles: Role[]) {
  const actions = { record: roles, confirm: roles, void: roles, refund: roles }
  return Object.fromEntries(PAYMENT_METHODS.map(method => [method, { ...actions }]))
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
      return { channel: 'email', provider: 'resend', providerName: '', reminders: 'scheduled', reminderDays: '14, 7' }
    case 'check-photos':
      return { viewerRoles: ['OWNER', 'SUPER_ADMIN'], retention: 'days', retentionDays: '365' }
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
        notes: 'Recovery and audit only.',
      }
  }
}

function signOffBody() {
  return {
    signerName: 'Pilot Owner',
    signerTitle: 'Owner',
    signedOn: '2026-11-02',
    documentTitle: REQUIREMENTS_DRAFT.title,
    documentDate: REQUIREMENTS_DRAFT.date,
    signedCopyRef: 'Signed PDF kept by the owner.',
    attested: true,
  }
}

function signOffInput() {
  const parsed = parseSignOffInput(signOffBody(), latest)
  if (!parsed.ok) throw new Error('sample sign-off should be valid')
  return parsed.input
}
