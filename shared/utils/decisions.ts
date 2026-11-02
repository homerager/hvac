import { z } from 'zod'
import { formatCents } from './money'
import { ROLE_LABELS, ROLES, type Role } from './rbac'

// The nine decisions that block live invoicing, and the record of a signed requirements version.
// Nothing here is filled from discovery. An empty answer stays open.
// Recording a signature does not change the access matrix, tax snapshots, or the service-call charge.

export const REQUIREMENTS_DRAFT = {
  title: 'HVAC Pilot Business Requirements for Client Review',
  date: '2026-10-26',
  note: 'Draft for client validation. It is not a signed client commitment.',
} as const

export const DECISION_IDS = [
  'invoice-approval',
  'payment-rights',
  'service-call',
  'tax-and-numbering',
  'delivery',
  'check-photos',
  'import',
  'offline',
  'super-admin',
] as const

export type DecisionId = (typeof DECISION_IDS)[number]

export const DECISION_CATALOG: Record<DecisionId, { title: string, why: string, short: string }> = {
  'invoice-approval': {
    short: 'Invoice approval',
    title: 'Must the owner approve every invoice at launch?',
    why: 'Affects how fast a job can be paid on site, and who may price the work. Also record who acts when the owner is unavailable.',
  },
  'payment-rights': {
    short: 'Payment rights',
    title: 'Who may record, confirm, void, or refund each payment method?',
    why: 'Affects cash control and whether a balance can be trusted. Includes whether a second approval is required.',
  },
  'service-call': {
    short: 'Service call',
    title: 'What are the service-call rate, included time, exceptions, and contract benefit?',
    why: 'Prevents a visit from carrying a charge the client has not authorized.',
  },
  'tax-and-numbering': {
    short: 'Tax and numbering',
    title: 'Which New York and New Jersey tax rules, due dates, and invoice numbering are authorized?',
    why: 'Required before a real invoice can be issued.',
  },
  'delivery': {
    short: 'Invoice delivery',
    title: 'How are invoices and receipts sent, and when should overdue reminders run?',
    why: 'Affects how the billing contact receives the invoice and how overdue balances are followed up.',
  },
  'check-photos': {
    short: 'Check photos',
    title: 'Who may view check photos, and how long are they retained?',
    why: 'Check photos are payment evidence. Access and retention need an explicit rule.',
  },
  'import': {
    short: 'Pilot import',
    title: 'Which forms, customer records, equipment records, and contracts are connected or imported?',
    why: 'Determines setup work and which history a technician can trust. Nothing imported is a complete answer.',
  },
  'offline': {
    short: 'Offline work',
    title: 'What must work without a connection, and what can wait for a successful sync?',
    why: 'Determines field behavior when a save cannot reach the server. The app must not show a save that did not succeed.',
  },
  'super-admin': {
    short: 'Super Admin',
    title: 'What may Super Admin do?',
    why: 'Installation recovery and day-to-day access are separate. The client names both before launch.',
  },
}

export const PAYMENT_METHODS = ['STRIPE', 'CASH', 'CHECK', 'VENMO', 'ZELLE'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  STRIPE: 'Card (Stripe)',
  CASH: 'Cash',
  CHECK: 'Check',
  VENMO: 'Venmo',
  ZELLE: 'Zelle',
}

export const PAYMENT_ACTIONS = ['record', 'confirm', 'void', 'refund'] as const

export type PaymentAction = (typeof PAYMENT_ACTIONS)[number]

export const PAYMENT_ACTION_LABELS: Record<PaymentAction, string> = {
  record: 'Record',
  confirm: 'Confirm',
  void: 'Void',
  refund: 'Refund',
}

export const INVOICE_FALLBACK_ROLES = ['OWNER', 'DISPATCHER', 'SUPER_ADMIN'] as const

export type InvoiceFallbackRole = (typeof INVOICE_FALLBACK_ROLES)[number]

export const IMPORT_KINDS = ['forms', 'customers', 'equipment', 'contracts'] as const

export type ImportKind = (typeof IMPORT_KINDS)[number]

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  forms: 'Request forms',
  customers: 'Customer records',
  equipment: 'Equipment records',
  contracts: 'Contract information',
}

export const OFFLINE_SCOPES = ['online_only', 'read_assigned', 'queue_work_records'] as const

export type OfflineScope = (typeof OFFLINE_SCOPES)[number]

export const OFFLINE_SCOPE_LABELS: Record<OfflineScope, string> = {
  online_only: 'Nothing is promised offline',
  read_assigned: 'Assigned jobs can be read offline',
  queue_work_records: 'Work records queue on the device until sync',
}

export const SUPER_ADMIN_CAPABILITIES = [
  ['installation', 'Installation and recovery'],
  ['users', 'User and role administration'],
  ['customers', 'Customers, contacts, and properties'],
  ['scheduling', 'Scheduling and dispatch'],
  ['allJobs', 'Seeing every job'],
  ['workRecords', 'Work records and corrections'],
  ['pricing', 'Prices and service-call waivers'],
  ['invoiceApproval', 'Invoice approval'],
  ['invoiceFinalize', 'Invoice finalization'],
  ['payments', 'Recording, confirming, voiding, and refunding payments'],
  ['audit', 'Audit log'],
] as const

export type SuperAdminCapability = (typeof SUPER_ADMIN_CAPABILITIES)[number][0]

export const DELIVERY_CHANNELS = ['email', 'manual'] as const
export const DELIVERY_PROVIDERS = ['resend', 'postmark', 'other'] as const

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number]
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number]

const ROLE_RANK = new Map<Role, number>(ROLES.map((role, index) => [role, index]))

export function isDecisionId(value: string): value is DecisionId {
  return (DECISION_IDS as readonly string[]).includes(value)
}

export function sortRoles(roles: readonly Role[]): Role[] {
  return [...new Set(roles)].sort((a, b) => (ROLE_RANK.get(a) ?? 0) - (ROLE_RANK.get(b) ?? 0))
}

/** Percent with up to four decimal places, stored as parts per million (8.875% = 88750). */
export function percentToPpm(input: string): number | null {
  const trimmed = input.trim()
  if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(trimmed)) return null
  const [whole = '0', fraction = ''] = trimmed.split('.')
  const ppm = Number(whole) * 10_000 + Number((fraction + '0000').slice(0, 4))
  if (!Number.isInteger(ppm) || ppm < 0 || ppm > 1_000_000) return null
  return ppm
}

export function formatPpm(ppm: number): string {
  const whole = Math.trunc(ppm / 10_000)
  const fraction = Math.abs(ppm % 10_000)
  if (fraction === 0) return String(whole)
  return `${whole}.${String(fraction).padStart(4, '0').replace(/0+$/, '')}`
}

/** Dollar input with at most two decimal places, from 0 to 10000.00. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,]/g, '')
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [whole = '0', fraction = ''] = trimmed.split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  if (!Number.isInteger(cents) || cents < 0 || cents > 1_000_000) return null
  return cents
}

export function centsToDollarInput(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const fraction = Math.abs(cents % 100)
  if (fraction === 0) return String(whole)
  return `${whole}.${String(fraction).padStart(2, '0')}`
}

export function isInvoiceNumberFormat(value: string): boolean {
  if (value.length < 5 || value.length > 40) return false
  const rest = value.replace(/\{(?:YYYY|YY|MM|SEQ)\}/g, '')
  if (/[{}]/.test(rest) || !/^[A-Za-z0-9\-_/]*$/.test(rest)) return false
  return value.match(/\{SEQ\}/g)?.length === 1
}

/** Latest signature date accepted from the browser, covering a timezone ahead of UTC. */
export function latestSignatureDate(now = new Date()): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
}

export type InvoiceApprovalAnswer = {
  requireOwnerApproval: boolean
  fallbackRole: InvoiceFallbackRole | null
}

export type PaymentRightsAnswer = {
  secondApproval: boolean
  secondApproverRoles: Role[]
  methods: Record<PaymentMethod, Record<PaymentAction, Role[]>>
}

export type ServiceCallAnswer = {
  amountCents: number
  includedMinutes: number
  exemptContractCustomers: boolean
  waiveRoles: Role[]
  exceptions: string
}

export type TaxAndNumberingAnswer = {
  nyRatePpm: number
  nyRule: string
  njRatePpm: number
  njRule: string
  paymentTermsDays: number
  numberFormat: string
}

export type DeliveryAnswer = {
  channel: DeliveryChannel
  provider: DeliveryProvider | null
  providerName: string | null
  reminders: 'none' | 'scheduled'
  reminderDaysAfterDue: number[]
}

export type CheckPhotoAnswer = {
  viewerRoles: Role[]
  retention: 'days' | 'indefinite'
  retentionDays: number | null
}

export type ImportAnswer = {
  include: ImportKind[]
  notes: string
}

export type OfflineAnswer = {
  scope: OfflineScope
  mustWork: string
  canWait: string
}

export type SuperAdminAnswer = Record<SuperAdminCapability, boolean> & {
  notes: string | null
}

export type DecisionAnswerMap = {
  'invoice-approval': InvoiceApprovalAnswer
  'payment-rights': PaymentRightsAnswer
  'service-call': ServiceCallAnswer
  'tax-and-numbering': TaxAndNumberingAnswer
  'delivery': DeliveryAnswer
  'check-photos': CheckPhotoAnswer
  'import': ImportAnswer
  'offline': OfflineAnswer
  'super-admin': SuperAdminAnswer
}

export type DecisionEntry<T> = {
  answer: T | null
  answeredAt: string | null
  answeredById: string | null
}

export type StoredSignOff = {
  signerName: string
  signerTitle: string
  signedOn: string
  documentTitle: string
  documentDate: string
  signedCopyRef: string | null
  recordedById: string
  recordedAt: string
}

export type VoidedSignOff = StoredSignOff & {
  voidedAt: string
  voidReason: string
}

export type DecisionRegister = {
  decisions: { [K in DecisionId]: DecisionEntry<DecisionAnswerMap[K]> }
  signOff: StoredSignOff | null
  voidedSignOffs: VoidedSignOff[]
}

export type DecisionView = {
  [K in DecisionId]: {
    id: K
    title: string
    why: string
    answered: boolean
    answeredAt: string | null
    summary: string | null
    answer: DecisionAnswerMap[K] | null
  }
}[DecisionId]

export type DecisionsResponse = {
  draft: typeof REQUIREMENTS_DRAFT
  progress: { answered: number, total: number }
  signed: boolean
  liveReady: boolean
  signOff: StoredSignOff | null
  voidedSignOffs: VoidedSignOff[]
  decisions: DecisionView[]
}

export type DecisionParseResult<K extends DecisionId = DecisionId>
  = { ok: true, answer: DecisionAnswerMap[K] }
    | { ok: false, fields: Record<string, string> }

type YesNo = 'yes' | 'no'

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

function requiredLine(empty: string, tooLong: string, max: number) {
  return z.string().transform(singleLine).pipe(z.string().min(1, { error: empty }).max(max, { error: tooLong }))
}

function optionalLine(tooLong: string, max: number) {
  return z.string().transform(singleLine).pipe(z.string().max(max, { error: tooLong })).transform(value => value.length === 0 ? null : value)
}

function requiredText(empty: string, tooLong: string, max = 1000) {
  return z.string().trim().min(1, { error: empty }).max(max, { error: tooLong })
}

function yesNo(message: string) {
  return z.enum(['yes', 'no'], { error: message })
}

function roleList(message: string, minimum: number) {
  const schema = z.array(z.enum(ROLES), { error: message })
  const bounded = minimum > 0 ? schema.min(minimum, { error: message }) : schema
  return bounded.max(ROLES.length).transform(sortRoles)
}

function wholeNumber(label: string, min: number, max: number) {
  return z.string().trim().superRefine((value, ctx) => {
    if (!/^\d+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: `Enter ${label} as a whole number.`, path: [] })
      return
    }
    const parsed = Number(value)
    if (parsed < min || parsed > max) {
      ctx.addIssue({ code: 'custom', message: `Enter ${label} from ${min} to ${max}.`, path: [] })
    }
  }).transform(value => Number(value))
}

function percentField(which: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (percentToPpm(value) === null) {
      ctx.addIssue({ code: 'custom', message: `Enter the ${which} tax rate as a percent, such as 8.875.`, path: [] })
    }
  }).transform(value => percentToPpm(value) as number)
}

const fallbackRoleSchema = z.union([
  z.literal(''),
  z.enum(INVOICE_FALLBACK_ROLES),
], { error: 'Choose who acts when the owner is unavailable.' })

export const invoiceApprovalSchema = z.object({
  requireOwnerApproval: yesNo('Choose whether the owner approves every invoice.'),
  fallbackRole: fallbackRoleSchema,
}).superRefine((value, ctx) => {
  if (value.requireOwnerApproval === 'yes' && value.fallbackRole === '') {
    ctx.addIssue({ code: 'custom', message: 'Choose who acts when the owner is unavailable.', path: ['fallbackRole'] })
  }
  if (value.requireOwnerApproval === 'no' && value.fallbackRole !== '') {
    ctx.addIssue({ code: 'custom', message: 'Clear the fallback when the owner does not approve every invoice.', path: ['fallbackRole'] })
  }
}).transform((value): InvoiceApprovalAnswer => ({
  requireOwnerApproval: value.requireOwnerApproval === 'yes',
  fallbackRole: value.requireOwnerApproval === 'yes' && value.fallbackRole !== '' ? value.fallbackRole : null,
}))

const paymentActionSchema = z.object({
  record: roleList('Choose who may record this payment.', 1),
  confirm: roleList('Choose who may confirm this payment.', 1),
  void: roleList('Choose who may void this payment.', 1),
  refund: roleList('Choose who may refund this payment.', 1),
})

export const paymentRightsSchema = z.object({
  secondApproval: yesNo('Choose whether a second approval is required.'),
  secondApproverRoles: roleList('Choose who gives the second approval.', 0),
  methods: z.object({
    STRIPE: paymentActionSchema,
    CASH: paymentActionSchema,
    CHECK: paymentActionSchema,
    VENMO: paymentActionSchema,
    ZELLE: paymentActionSchema,
  }),
}).superRefine((value, ctx) => {
  if (value.secondApproval === 'yes' && value.secondApproverRoles.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Choose who gives the second approval.', path: ['secondApproverRoles'] })
  }
}).transform((value): PaymentRightsAnswer => ({
  secondApproval: value.secondApproval === 'yes',
  secondApproverRoles: value.secondApproval === 'yes' ? value.secondApproverRoles : [],
  methods: value.methods,
}))

export const serviceCallSchema = z.object({
  amount: z.string().trim().superRefine((value, ctx) => {
    if (dollarsToCents(value) === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter the service-call rate in dollars, such as 89 or 89.50.', path: [] })
    }
  }).transform(value => dollarsToCents(value) as number),
  includedMinutes: wholeNumber('included minutes', 0, 1440),
  exemptContractCustomers: yesNo('Choose whether contract customers are exempt.'),
  waiveRoles: roleList('Choose roles from the list.', 0),
  exceptions: requiredText('Describe the exceptions, or write None.', 'Exceptions must be 1000 characters or fewer.'),
}).transform((value): ServiceCallAnswer => ({
  amountCents: value.amount,
  includedMinutes: value.includedMinutes,
  exemptContractCustomers: value.exemptContractCustomers === 'yes',
  waiveRoles: value.waiveRoles,
  exceptions: value.exceptions,
}))

export const taxAndNumberingSchema = z.object({
  nyRate: percentField('New York'),
  nyRule: requiredText('Describe the New York tax rule the accountant authorized.', 'The New York rule must be 1000 characters or fewer.'),
  njRate: percentField('New Jersey'),
  njRule: requiredText('Describe the New Jersey tax rule the accountant authorized.', 'The New Jersey rule must be 1000 characters or fewer.'),
  paymentTermsDays: wholeNumber('the payment term', 0, 365),
  numberFormat: z.string().trim().superRefine((value, ctx) => {
    if (!isInvoiceNumberFormat(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use 5–40 characters with exactly one {SEQ}. Optional tokens: {YYYY}, {YY}, {MM}.',
        path: [],
      })
    }
  }),
}).transform((value): TaxAndNumberingAnswer => ({
  nyRatePpm: value.nyRate,
  nyRule: value.nyRule,
  njRatePpm: value.njRate,
  njRule: value.njRule,
  paymentTermsDays: value.paymentTermsDays,
  numberFormat: value.numberFormat,
}))

const reminderDaysSchema = z.string().trim().superRefine((value, ctx) => {
  if (value.length === 0) return
  const parts = value.split(/[\s,]+/).filter(part => part.length > 0)
  if (parts.length > 6 || parts.some(part => !/^\d{1,3}$/.test(part))) {
    ctx.addIssue({ code: 'custom', message: 'Enter up to 6 reminder days, separated by commas.', path: [] })
    return
  }
  if (parts.some(part => Number(part) < 1 || Number(part) > 365)) {
    ctx.addIssue({ code: 'custom', message: 'Each reminder day must be from 1 to 365.', path: [] })
  }
}).transform((value) => {
  if (value.length === 0) return [] as number[]
  return [...new Set(value.split(/[\s,]+/).filter(part => part.length > 0).map(Number))].sort((a, b) => a - b)
})

export const deliverySchema = z.object({
  channel: z.enum(DELIVERY_CHANNELS, { error: 'Choose how invoices and receipts are sent.' }),
  provider: z.union([z.literal(''), z.enum(DELIVERY_PROVIDERS)], { error: 'Choose the email provider.' }),
  providerName: z.string().transform(singleLine).pipe(z.string().max(80, { error: 'Provider name must be 80 characters or fewer.' })),
  reminders: z.enum(['none', 'scheduled'], { error: 'Choose whether overdue reminders run.' }),
  reminderDays: reminderDaysSchema,
}).superRefine((value, ctx) => {
  if (value.channel === 'email' && value.provider === '') {
    ctx.addIssue({ code: 'custom', message: 'Choose the email provider.', path: ['provider'] })
  }
  if (value.channel === 'email' && value.provider === 'other' && value.providerName.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Name the email provider.', path: ['providerName'] })
  }
  if (value.reminders === 'scheduled' && value.reminderDays.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Enter the days after the due date when reminders run.', path: ['reminderDays'] })
  }
}).transform((value): DeliveryAnswer => ({
  channel: value.channel,
  provider: value.channel === 'email' && value.provider !== '' ? value.provider : null,
  providerName: value.channel === 'email' && value.provider === 'other' ? value.providerName : null,
  reminders: value.reminders,
  reminderDaysAfterDue: value.reminders === 'scheduled' ? value.reminderDays : [],
}))

export const checkPhotoSchema = z.object({
  viewerRoles: roleList('Choose who may view check photos.', 1),
  retention: z.enum(['days', 'indefinite'], { error: 'Choose how long check photos are kept.' }),
  retentionDays: z.string().trim(),
}).superRefine((value, ctx) => {
  if (value.retention !== 'days') return
  if (!/^\d+$/.test(value.retentionDays)) {
    ctx.addIssue({ code: 'custom', message: 'Enter how many days check photos are kept.', path: ['retentionDays'] })
    return
  }
  const days = Number(value.retentionDays)
  if (days < 1 || days > 3650) {
    ctx.addIssue({ code: 'custom', message: 'Enter a retention period from 1 to 3650 days.', path: ['retentionDays'] })
  }
}).transform((value): CheckPhotoAnswer => ({
  viewerRoles: value.viewerRoles,
  retention: value.retention,
  retentionDays: value.retention === 'days' ? Number(value.retentionDays) : null,
}))

export const importSchema = z.object({
  include: z.array(z.enum(IMPORT_KINDS), { error: 'Choose the records to import from the list.' })
    .max(IMPORT_KINDS.length)
    .transform(kinds => [...new Set(kinds)]),
  notes: requiredText('Say what is imported, or write that nothing is imported for the pilot.', 'Import notes must be 1000 characters or fewer.'),
}).transform((value): ImportAnswer => ({
  include: value.include,
  notes: value.notes,
}))

export const offlineSchema = z.object({
  scope: z.enum(OFFLINE_SCOPES, { error: 'Choose what has to work without a connection.' }),
  mustWork: requiredText('Describe what must work with no connection.', 'This answer must be 1000 characters or fewer.'),
  canWait: requiredText('Describe what can wait for a successful sync.', 'This answer must be 1000 characters or fewer.'),
}).transform((value): OfflineAnswer => value)

const capabilityShape = Object.fromEntries(
  SUPER_ADMIN_CAPABILITIES.map(([key, label]) => [key, yesNo(`Choose whether Super Admin may handle ${label.toLowerCase()}.`)]),
) as { [K in SuperAdminCapability]: z.ZodType<YesNo> }

export const superAdminSchema = z.object({
  ...capabilityShape,
  notes: optionalLine('Notes must be 1000 characters or fewer.', 1000),
}).transform((value): SuperAdminAnswer => {
  const answer = { notes: value.notes } as SuperAdminAnswer
  for (const [key] of SUPER_ADMIN_CAPABILITIES) answer[key] = value[key] === 'yes'
  return answer
})

const DECISION_SCHEMAS = {
  'invoice-approval': invoiceApprovalSchema,
  'payment-rights': paymentRightsSchema,
  'service-call': serviceCallSchema,
  'tax-and-numbering': taxAndNumberingSchema,
  'delivery': deliverySchema,
  'check-photos': checkPhotoSchema,
  'import': importSchema,
  'offline': offlineSchema,
  'super-admin': superAdminSchema,
} as const

export function decisionFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_form'
    if (!fields[key]) fields[key] = issue.message
  }
  return fields
}

export function parseDecisionInput<K extends DecisionId>(id: K, body: unknown): DecisionParseResult<K> {
  const parsed = DECISION_SCHEMAS[id].safeParse(body)
  if (!parsed.success) return { ok: false, fields: decisionFieldErrors(parsed.error) }
  return { ok: true, answer: parsed.data as DecisionAnswerMap[K] }
}

export function signOffSchema(latestDate: string) {
  return z.object({
    signerName: requiredLine('Enter the name of the person who signed.', 'Signer name must be 120 characters or fewer.', 120),
    signerTitle: requiredLine('Enter the signer’s title.', 'Signer title must be 80 characters or fewer.', 80),
    signedOn: z.string().trim(),
    documentTitle: requiredLine('Enter the title of the signed requirements.', 'Document title must be 160 characters or fewer.', 160),
    documentDate: z.string().trim(),
    signedCopyRef: optionalLine('The location of the signed copy must be 200 characters or fewer.', 200),
    attested: z.literal(true, { error: 'Confirm that the client signed this version.' }),
  }).superRefine((value, ctx) => {
    if (!isIsoDate(value.documentDate) || value.documentDate < REQUIREMENTS_DRAFT.date) {
      ctx.addIssue({
        code: 'custom',
        message: 'The signed document cannot be dated before the October 26, 2026 draft.',
        path: ['documentDate'],
      })
    }
    if (!isIsoDate(value.signedOn) || value.signedOn > latestDate) {
      ctx.addIssue({ code: 'custom', message: 'Enter the date the client signed. It cannot be in the future.', path: ['signedOn'] })
    }
    else if (isIsoDate(value.documentDate) && value.signedOn < value.documentDate) {
      ctx.addIssue({ code: 'custom', message: 'The signature date cannot be earlier than the document date.', path: ['signedOn'] })
    }
  }).transform(value => ({
    signerName: value.signerName,
    signerTitle: value.signerTitle,
    signedOn: value.signedOn,
    documentTitle: value.documentTitle,
    documentDate: value.documentDate,
    signedCopyRef: value.signedCopyRef,
  }))
}

export type SignOffInput = z.output<ReturnType<typeof signOffSchema>>

export function parseSignOffInput(body: unknown, latestDate: string): { ok: true, input: SignOffInput } | { ok: false, fields: Record<string, string> } {
  const parsed = signOffSchema(latestDate).safeParse(body)
  if (!parsed.success) return { ok: false, fields: decisionFieldErrors(parsed.error) }
  return { ok: true, input: parsed.data }
}

function blankEntry<T>(): DecisionEntry<T> {
  return { answer: null, answeredAt: null, answeredById: null }
}

export function emptyDecisionRegister(): DecisionRegister {
  return {
    decisions: {
      'invoice-approval': blankEntry(),
      'payment-rights': blankEntry(),
      'service-call': blankEntry(),
      'tax-and-numbering': blankEntry(),
      'delivery': blankEntry(),
      'check-photos': blankEntry(),
      'import': blankEntry(),
      'offline': blankEntry(),
      'super-admin': blankEntry(),
    },
    signOff: null,
    voidedSignOffs: [],
  }
}

export function decisionProgress(register: DecisionRegister): { answered: number, total: number } {
  return {
    answered: DECISION_IDS.filter(id => register.decisions[id].answer !== null).length,
    total: DECISION_IDS.length,
  }
}

export function isLiveReady(register: DecisionRegister): boolean {
  return register.signOff !== null && decisionProgress(register).answered === DECISION_IDS.length
}

export function summarizeDecision<K extends DecisionId>(id: K, answer: DecisionAnswerMap[K] | null): string | null {
  if (!answer) return null
  switch (id) {
    case 'invoice-approval':
      return summarizeInvoice(answer as InvoiceApprovalAnswer)
    case 'payment-rights':
      return summarizePayments(answer as PaymentRightsAnswer)
    case 'service-call':
      return summarizeServiceCall(answer as ServiceCallAnswer)
    case 'tax-and-numbering':
      return summarizeTax(answer as TaxAndNumberingAnswer)
    case 'delivery':
      return summarizeDelivery(answer as DeliveryAnswer)
    case 'check-photos':
      return summarizeCheckPhotos(answer as CheckPhotoAnswer)
    case 'import':
      return summarizeImport(answer as ImportAnswer)
    case 'offline':
      return summarizeOffline(answer as OfflineAnswer)
    case 'super-admin':
      return summarizeSuperAdmin(answer as SuperAdminAnswer)
  }
}

export function toDecisionsResponse(register: DecisionRegister): DecisionsResponse {
  const progress = decisionProgress(register)
  return {
    draft: REQUIREMENTS_DRAFT,
    progress,
    signed: register.signOff !== null,
    liveReady: isLiveReady(register),
    signOff: register.signOff,
    voidedSignOffs: register.voidedSignOffs,
    decisions: DECISION_IDS.map((id) => {
      const entry = register.decisions[id]
      const catalog = DECISION_CATALOG[id]
      return {
        id,
        title: catalog.title,
        why: catalog.why,
        answered: entry.answer !== null,
        answeredAt: entry.answeredAt,
        summary: summarizeDecision(id, entry.answer),
        answer: entry.answer,
      }
    }),
  }
}

export function answerFor<K extends DecisionId>(response: DecisionsResponse, id: K): DecisionAnswerMap[K] | null {
  const found = response.decisions.find(decision => decision.id === id)
  return (found?.answer ?? null) as DecisionAnswerMap[K] | null
}

export function withDecisionAnswer<K extends DecisionId>(
  register: DecisionRegister,
  id: K,
  answer: DecisionAnswerMap[K],
  actorId: string,
  at: string,
): { register: DecisionRegister, changed: boolean, voidReason: string | null } {
  const current = register.decisions[id]
  if (current.answer !== null && JSON.stringify(current.answer) === JSON.stringify(answer)) {
    return { register, changed: false, voidReason: null }
  }
  const next = structuredClone(register)
  next.decisions[id] = { answer, answeredAt: at, answeredById: actorId }
  const voidReason = next.signOff ? `${DECISION_CATALOG[id].short} changed after the requirements were signed.` : null
  if (voidReason) clearSignature(next, voidReason, at)
  return { register: next, changed: true, voidReason }
}

export function withDecisionReopened(
  register: DecisionRegister,
  id: DecisionId,
  at: string,
): { register: DecisionRegister, changed: boolean, voidReason: string | null } {
  if (register.decisions[id].answer === null) return { register, changed: false, voidReason: null }
  const next = structuredClone(register)
  next.decisions[id] = blankEntry()
  const voidReason = next.signOff ? `${DECISION_CATALOG[id].short} was reopened after the requirements were signed.` : null
  if (voidReason) clearSignature(next, voidReason, at)
  return { register: next, changed: true, voidReason }
}

export function withSignOff(
  register: DecisionRegister,
  input: SignOffInput,
  actorId: string,
  at: string,
): { ok: true, register: DecisionRegister } | { ok: false, statusCode: 409, message: string } {
  if (decisionProgress(register).answered !== DECISION_IDS.length) {
    return { ok: false, statusCode: 409, message: 'Answer all nine decisions before recording a signature.' }
  }
  if (register.signOff) {
    return {
      ok: false,
      statusCode: 409,
      message: 'A signature is already recorded. Change an answer to clear it before recording another.',
    }
  }
  return {
    ok: true,
    register: {
      ...register,
      signOff: {
        ...input,
        recordedById: actorId,
        recordedAt: at,
      },
    },
  }
}

export function parseDecisionRegister(value: unknown): DecisionRegister {
  const record = isRecord(value) ? value : {}
  const stored = isRecord(record.decisions) ? record.decisions : {}
  const empty = emptyDecisionRegister()
  for (const id of DECISION_IDS) {
    const entry = isRecord(stored[id]) ? stored[id] : {}
    const parsed = DECISION_SCHEMAS[id].safeParse(formFromStored(id, entry.answer))
    empty.decisions[id] = parsed.success
      ? {
          answer: parsed.data as DecisionAnswerMap[typeof id],
          answeredAt: typeof entry.answeredAt === 'string' ? entry.answeredAt : null,
          answeredById: typeof entry.answeredById === 'string' ? entry.answeredById : null,
        }
      : blankEntry()
  }
  empty.signOff = parseStoredSignOff(record.signOff)
  empty.voidedSignOffs = Array.isArray(record.voidedSignOffs)
    ? record.voidedSignOffs.flatMap((item) => {
        const signOff = parseStoredSignOff(item)
        if (!signOff || !isRecord(item) || typeof item.voidedAt !== 'string' || typeof item.voidReason !== 'string') return []
        return [{ ...signOff, voidedAt: item.voidedAt, voidReason: item.voidReason }]
      }).slice(0, 20)
    : []
  if (empty.signOff && decisionProgress(empty).answered !== DECISION_IDS.length) empty.signOff = null
  return empty
}

export function serviceCallSettingValue(register: DecisionRegister, existing: unknown): Record<string, unknown> {
  const answer = register.decisions['service-call'].answer
  return {
    ...(isRecord(existing) ? existing : {}),
    amountCents: answer?.amountCents ?? null,
    includedMinutes: answer?.includedMinutes ?? null,
    exemptContractCustomers: answer?.exemptContractCustomers ?? null,
    waiveRoles: answer?.waiveRoles ?? [],
  }
}

export function invoiceSettingValue(register: DecisionRegister, existing: unknown): Record<string, unknown> {
  const approval = register.decisions['invoice-approval'].answer
  const tax = register.decisions['tax-and-numbering'].answer
  return {
    ...(isRecord(existing) ? existing : {}),
    requireOwnerApproval: approval?.requireOwnerApproval ?? null,
    approvalFallbackRole: approval?.fallbackRole ?? null,
    numberFormat: tax?.numberFormat ?? null,
    paymentTermsDays: tax?.paymentTermsDays ?? null,
  }
}

function clearSignature(register: DecisionRegister, reason: string, at: string): void {
  if (!register.signOff) return
  register.voidedSignOffs.unshift({ ...register.signOff, voidedAt: at, voidReason: reason })
  register.voidedSignOffs = register.voidedSignOffs.slice(0, 20)
  register.signOff = null
}

function summarizeInvoice(answer: InvoiceApprovalAnswer): string {
  if (!answer.requireOwnerApproval) return 'The owner does not have to approve every invoice.'
  const who = answer.fallbackRole ? ROLE_LABELS[answer.fallbackRole] : 'A named fallback'
  return `The owner approves every invoice. ${who} acts when the owner is unavailable.`
}

function summarizePayments(answer: PaymentRightsAnswer): string {
  const approval = answer.secondApproval
    ? `Second approval is required from ${listRoles(answer.secondApproverRoles)}.`
    : 'No second approval is required.'
  return `${approval} Record, confirm, void, and refund are set for each payment method.`
}

function summarizeServiceCall(answer: ServiceCallAnswer): string {
  const exempt = answer.exemptContractCustomers ? 'Contract customers are exempt.' : 'Contract customers are not exempt.'
  const waive = answer.waiveRoles.length > 0 ? `${listRoles(answer.waiveRoles)} may waive it.` : 'Nobody may waive it.'
  return `${formatCents(answer.amountCents)} service call, ${answer.includedMinutes} minutes included. ${exempt} ${waive}`
}

function summarizeTax(answer: TaxAndNumberingAnswer): string {
  const due = answer.paymentTermsDays === 0 ? 'Due on receipt.' : `Due in ${answer.paymentTermsDays} days.`
  return `New York ${formatPpm(answer.nyRatePpm)}%, New Jersey ${formatPpm(answer.njRatePpm)}%. ${due} Numbers use ${answer.numberFormat}.`
}

function summarizeDelivery(answer: DeliveryAnswer): string {
  const channel = answer.channel === 'manual'
    ? 'Staff send invoices and receipts themselves.'
    : `Email via ${answer.provider === 'other' ? (answer.providerName ?? 'the named provider') : providerLabel(answer.provider)}.`
  const reminders = answer.reminders === 'none'
    ? 'No overdue reminders.'
    : `Reminders ${answer.reminderDaysAfterDue.join(', ')} days after the due date.`
  return `${channel} ${reminders}`
}

function summarizeCheckPhotos(answer: CheckPhotoAnswer): string {
  const retention = answer.retention === 'indefinite' ? 'Kept indefinitely.' : `Kept for ${answer.retentionDays} days.`
  return `${listRoles(answer.viewerRoles)} may view check photos. ${retention}`
}

function summarizeImport(answer: ImportAnswer): string {
  if (answer.include.length === 0) return `Nothing is imported. ${answer.notes}`
  const kinds = answer.include.map(kind => IMPORT_KIND_LABELS[kind]).join(', ')
  return `Import ${kinds}. ${answer.notes}`
}

function summarizeOffline(answer: OfflineAnswer): string {
  return `${OFFLINE_SCOPE_LABELS[answer.scope]}. Must work: ${answer.mustWork} Can wait: ${answer.canWait}`
}

function summarizeSuperAdmin(answer: SuperAdminAnswer): string {
  const granted = SUPER_ADMIN_CAPABILITIES.filter(([key]) => answer[key]).map(([, label]) => label)
  if (granted.length === 0) return 'Super Admin is granted none of the listed capabilities.'
  return `Super Admin may handle: ${granted.join(', ')}.`
}

function listRoles(roles: readonly Role[]): string {
  return roles.map(role => ROLE_LABELS[role]).join(', ')
}

function providerLabel(provider: DeliveryProvider | null): string {
  if (provider === 'resend') return 'Resend'
  if (provider === 'postmark') return 'Postmark'
  return 'the named provider'
}

function formFromStored(id: DecisionId, answer: unknown): unknown {
  if (!isRecord(answer)) return answer
  switch (id) {
    case 'invoice-approval':
      return {
        requireOwnerApproval: answer.requireOwnerApproval === true ? 'yes' : answer.requireOwnerApproval === false ? 'no' : '',
        fallbackRole: typeof answer.fallbackRole === 'string' ? answer.fallbackRole : '',
      }
    case 'payment-rights':
      return {
        secondApproval: answer.secondApproval === true ? 'yes' : answer.secondApproval === false ? 'no' : '',
        secondApproverRoles: answer.secondApproverRoles,
        methods: answer.methods,
      }
    case 'service-call':
      return {
        amount: typeof answer.amountCents === 'number' ? centsToDollarInput(answer.amountCents) : '',
        includedMinutes: typeof answer.includedMinutes === 'number' ? String(answer.includedMinutes) : '',
        exemptContractCustomers: answer.exemptContractCustomers === true ? 'yes' : answer.exemptContractCustomers === false ? 'no' : '',
        waiveRoles: answer.waiveRoles,
        exceptions: answer.exceptions,
      }
    case 'tax-and-numbering':
      return {
        nyRate: typeof answer.nyRatePpm === 'number' ? formatPpm(answer.nyRatePpm) : '',
        nyRule: answer.nyRule,
        njRate: typeof answer.njRatePpm === 'number' ? formatPpm(answer.njRatePpm) : '',
        njRule: answer.njRule,
        paymentTermsDays: typeof answer.paymentTermsDays === 'number' ? String(answer.paymentTermsDays) : '',
        numberFormat: answer.numberFormat,
      }
    case 'delivery':
      return {
        channel: answer.channel,
        provider: typeof answer.provider === 'string' ? answer.provider : '',
        providerName: typeof answer.providerName === 'string' ? answer.providerName : '',
        reminders: answer.reminders,
        reminderDays: Array.isArray(answer.reminderDaysAfterDue) ? answer.reminderDaysAfterDue.join(', ') : '',
      }
    case 'check-photos':
      return {
        viewerRoles: answer.viewerRoles,
        retention: answer.retention,
        retentionDays: typeof answer.retentionDays === 'number' ? String(answer.retentionDays) : '',
      }
    case 'super-admin':
      return {
        ...Object.fromEntries(SUPER_ADMIN_CAPABILITIES.map(([key]) => {
          const value = answer[key]
          return [key, value === true ? 'yes' : value === false ? 'no' : '']
        })),
        notes: typeof answer.notes === 'string' ? answer.notes : '',
      }
    default:
      return answer
  }
}

function parseStoredSignOff(value: unknown): StoredSignOff | null {
  if (!isRecord(value)) return null
  const text = (key: string, max: number) => {
    const item = value[key]
    if (typeof item !== 'string') return null
    const trimmed = singleLine(item)
    return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
  }
  const signerName = text('signerName', 120)
  const signerTitle = text('signerTitle', 80)
  const documentTitle = text('documentTitle', 160)
  const signedOn = typeof value.signedOn === 'string' && isIsoDate(value.signedOn) ? value.signedOn : null
  const documentDate = typeof value.documentDate === 'string' && isIsoDate(value.documentDate) ? value.documentDate : null
  const recordedById = typeof value.recordedById === 'string' && value.recordedById.length > 0 ? value.recordedById : null
  const recordedAt = typeof value.recordedAt === 'string' && value.recordedAt.length > 0 ? value.recordedAt : null
  if (!signerName || !signerTitle || !documentTitle || !signedOn || !documentDate || !recordedById || !recordedAt) return null
  const ref = value.signedCopyRef
  const signedCopyRef = typeof ref === 'string' && singleLine(ref).length > 0 ? singleLine(ref).slice(0, 200) : null
  return { signerName, signerTitle, signedOn, documentTitle, documentDate, signedCopyRef, recordedById, recordedAt }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
