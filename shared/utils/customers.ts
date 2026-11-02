import { z } from 'zod'
import { normalizeEmail } from './email'

// Customer, contacts, and properties (BR-02).
// Tax follows the property (NY or NJ). The invoice recipient is the property's
// billing contact when one is set, otherwise the customer's billing contact.

export const SERVICE_STATES = ['NY', 'NJ'] as const

export type ServiceState = (typeof SERVICE_STATES)[number]

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  NY: 'New York',
  NJ: 'New Jersey',
}

export const CUSTOMER_TYPES = ['COMMERCIAL', 'RESIDENTIAL'] as const

export type CustomerType = (typeof CUSTOMER_TYPES)[number]

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  COMMERCIAL: 'Commercial',
  RESIDENTIAL: 'Residential',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function parseServiceState(value: string): ServiceState | null {
  const state = value.trim().toUpperCase()
  return isServiceState(state) ? state : null
}

export function isServiceState(value: string): value is ServiceState {
  return (SERVICE_STATES as readonly string[]).includes(value)
}

export type ContactRef = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export type InvoiceRecipient = ContactRef & {
  source: 'property' | 'customer'
}

export type TaxContext = {
  state: ServiceState
  jurisdiction: string | null
  exempt: boolean
}

export type ContactRecord = {
  id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export type PropertyRecord = {
  id: string
  name: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  state: ServiceState
  postalCode: string
  taxJurisdiction: string | null
  taxExempt: boolean
  accessNotes: string | null
  siteContactId: string | null
  billingContactId: string | null
  archivedAt: string | null
  tax: TaxContext
  invoiceRecipient: InvoiceRecipient | null
}

export type CustomerDetail = {
  id: string
  name: string
  type: CustomerType
  notes: string | null
  isContract: boolean
  billingContactId: string | null
  archivedAt: string | null
  contacts: ContactRecord[]
  properties: PropertyRecord[]
}

export type CustomerSummary = {
  id: string
  name: string
  type: CustomerType
  isContract: boolean
  archivedAt: string | null
  activePropertyCount: number
  contactCount: number
  billingContactName: string | null
}

export type CustomerList = {
  customers: CustomerSummary[]
  truncated: boolean
}

export type FieldErrors = Record<string, string>

/** Property tax wins over any other site the same customer owns. */
export function taxContextOf(property: {
  state: string
  taxJurisdiction: string | null
  taxExempt: boolean
}): TaxContext | null {
  const state = parseServiceState(property.state)
  if (!state) return null
  return {
    state,
    jurisdiction: property.taxJurisdiction,
    exempt: property.taxExempt,
  }
}

/** A property billing contact overrides the customer default (BR-02). */
export function resolveInvoiceRecipient(input: {
  customerBilling: ContactRef | null
  propertyBilling: ContactRef | null
}): InvoiceRecipient | null {
  if (input.propertyBilling) return { ...input.propertyBilling, source: 'property' }
  if (input.customerBilling) return { ...input.customerBilling, source: 'customer' }
  return null
}

export function propertyTitle(property: { name: string | null, addressLine1: string }): string {
  return property.name || property.addressLine1
}

export function formatPropertyAddress(property: {
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
}): string {
  const street = [property.addressLine1, property.addressLine2].filter((part): part is string => Boolean(part)).join(', ')
  return `${street}, ${property.city}, ${property.state} ${property.postalCode}`
}

export function taxContextLabel(tax: TaxContext): string {
  const place = SERVICE_STATE_LABELS[tax.state]
  const jurisdiction = tax.jurisdiction ? `, ${tax.jurisdiction}` : ''
  const exempt = tax.exempt ? ', tax exempt' : ''
  return `Tax context: ${place}${jurisdiction}${exempt}`
}

export function invoiceRecipientLabel(recipient: InvoiceRecipient | null): string {
  if (!recipient) return 'Add a billing contact before sending an invoice.'
  const where = recipient.source === 'property'
    ? 'billing contact for this property'
    : 'customer billing contact'
  const reach = [recipient.email, recipient.phone].filter((part): part is string => Boolean(part)).join(' · ')
  const suffix = reach ? ` — ${reach}` : ''
  return `Invoices go to ${recipient.name} (${where})${suffix}.`
}

export function contactRoles(contactId: string, customer: {
  billingContactId: string | null
  properties: ReadonlyArray<{
    name: string | null
    addressLine1: string
    siteContactId: string | null
    billingContactId: string | null
    archivedAt: string | null
  }>
}): string[] {
  const roles: string[] = []
  if (customer.billingContactId === contactId) roles.push('Customer billing contact')
  for (const property of customer.properties) {
    if (property.archivedAt) continue
    const title = propertyTitle(property)
    if (property.billingContactId === contactId) roles.push(`Billing contact for ${title}`)
    if (property.siteContactId === contactId) roles.push(`Site contact for ${title}`)
  }
  return roles
}

export function formFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')
    if (!key || fields[key]) continue
    fields[key] = issue.message
  }
  return fields
}

export const contactInputSchema = z.object({
  name: requiredLine(120, 'Enter a contact name.', 'Contact name must be 120 characters or fewer.'),
  title: optionalLine(80, 'Title must be 80 characters or fewer.'),
  email: optionalEmail(),
  phone: optionalPhone(),
  notes: optionalText(1000, 'Contact notes must be 1000 characters or fewer.'),
})

export type ContactInput = z.infer<typeof contactInputSchema>

const propertyShape = {
  name: optionalLine(120, 'Property name must be 120 characters or fewer.'),
  addressLine1: requiredLine(200, 'Enter a street address.', 'Street address must be 200 characters or fewer.'),
  addressLine2: optionalLine(200, 'Address line 2 must be 200 characters or fewer.'),
  city: requiredLine(120, 'Enter a city.', 'City must be 120 characters or fewer.'),
  state: z.string({ error: 'Choose New York or New Jersey.' }).trim().transform(value => value.toUpperCase()).pipe(
    z.enum(SERVICE_STATES, { error: 'Choose New York or New Jersey.' }),
  ),
  postalCode: z.string({ error: 'Enter a ZIP code.' }).trim().regex(/^\d{5}(?:-\d{4})?$/, { error: 'Enter a 5-digit ZIP code.' }),
  taxJurisdiction: optionalLine(120, 'Tax jurisdiction must be 120 characters or fewer.'),
  taxExempt: z.boolean({ error: 'Say whether this property is tax exempt.' }),
  accessNotes: optionalText(2000, 'Access notes must be 2000 characters or fewer.'),
}

/** Address and tax context, before a site or billing contact exists. */
export const propertyDraftSchema = z.object(propertyShape)

export type PropertyDraft = z.infer<typeof propertyDraftSchema>

export const propertyInputSchema = propertyDraftSchema.extend({
  siteContactId: optionalUuid('Choose a site contact for this customer.'),
  billingContactId: optionalUuid('Choose a billing contact for this customer.'),
})

export type PropertyInput = z.infer<typeof propertyInputSchema>

export const customerCreateSchema = z.object({
  name: requiredLine(200, 'Enter a customer name.', 'Customer name must be 200 characters or fewer.'),
  type: z.enum(CUSTOMER_TYPES, { error: 'Choose commercial or residential.' }),
  notes: optionalText(2000, 'Notes must be 2000 characters or fewer.'),
  isContract: z.boolean({ error: 'Say whether this is a contract customer.' }),
  contact: contactInputSchema.optional(),
  property: propertyDraftSchema.optional(),
})

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>

export const customerUpdateSchema = z.object({
  name: requiredLine(200, 'Enter a customer name.', 'Customer name must be 200 characters or fewer.'),
  type: z.enum(CUSTOMER_TYPES, { error: 'Choose commercial or residential.' }),
  notes: optionalText(2000, 'Notes must be 2000 characters or fewer.'),
  isContract: z.boolean({ error: 'Say whether this is a contract customer.' }),
  billingContactId: optionalUuid('Choose a billing contact for this customer.'),
})

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>

export const customerListQuerySchema = z.object({
  q: z.union([z.string(), z.array(z.string())]).optional().transform((value) => {
    const raw = Array.isArray(value) ? value[0] ?? '' : value ?? ''
    return raw.trim()
  }).pipe(z.string().max(120, { error: 'Search must be 120 characters or fewer.' })),
  archived: z.union([z.string(), z.array(z.string()), z.boolean()]).optional().transform((value) => {
    const raw = Array.isArray(value) ? value[0] : value
    return raw === true || raw === '1' || raw === 'true'
  }),
})

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>

function optionalEmail() {
  return z.union([
    z.string().trim().max(254, { error: 'Email must be 254 characters or fewer.' }),
    z.null(),
  ]).optional().transform((value) => {
    if (typeof value !== 'string') return null
    const normalized = normalizeEmail(value)
    return normalized.length === 0 ? null : normalized
  }).pipe(z.union([
    z.null(),
    z.email({ error: 'Enter a valid email address.' }),
  ]))
}

function optionalPhone() {
  return z.union([z.string(), z.null()]).optional().transform(value => typeof value === 'string' ? value.trim() : '').pipe(
    z.union([
      z.literal('').transform(() => null),
      z.string().max(40, { error: 'Phone number must be 40 characters or fewer.' }).refine(isPhone, {
        error: 'Enter a phone number with at least 7 digits.',
      }),
    ]),
  )
}

function optionalUuid(message: string) {
  return z.union([z.string(), z.null()]).optional().transform((value) => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  }).pipe(z.union([z.null(), z.uuid({ error: message })], { error: message }))
}

function requiredLine(max: number, empty: string, tooLong: string) {
  return z.string({ error: empty }).transform(singleLine).pipe(
    z.string().min(1, { error: empty }).max(max, { error: tooLong }),
  )
}

function optionalLine(max: number, tooLong: string) {
  return z.union([z.string(), z.null()]).optional().transform(value => singleLine(typeof value === 'string' ? value : '')).pipe(
    z.string().max(max, { error: tooLong }),
  ).transform(value => value.length === 0 ? null : value)
}

function optionalText(max: number, tooLong: string) {
  return z.union([z.string(), z.null()]).optional().transform(value => (typeof value === 'string' ? value : '').replace(/\r\n/g, '\n').trim()).pipe(
    z.string().max(max, { error: tooLong }),
  ).transform(value => value.length === 0 ? null : value)
}

function isPhone(value: string): boolean {
  if (!/^[0-9+().\-\s]+$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim()
}
