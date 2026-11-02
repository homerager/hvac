import { describe, expect, it } from 'vitest'
import type { CustomerType as PrismaCustomerType } from '../../server/generated/prisma/client'
import {
  contactInputSchema,
  contactRoles,
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
  formFieldErrors,
  formatPropertyAddress,
  invoiceRecipientLabel,
  propertyInputSchema,
  resolveInvoiceRecipient,
  taxContextLabel,
  taxContextOf,
  type CustomerType,
} from '../../shared/utils/customers'

type TypesMatch = [PrismaCustomerType] extends [CustomerType]
  ? [CustomerType] extends [PrismaCustomerType] ? true : never
  : never
const typesMatch: TypesMatch = true

const ap = { id: 'ap', name: 'Accounts Payable', email: 'ap@example.com', phone: null }
const frank = { id: 'frank', name: 'Frank Russo', email: null, phone: '+12125550101' }

describe('customer tax and billing', () => {
  it('keeps the app customer types aligned with the database enum', () => {
    expect(typesMatch).toBe(true)
  })

  it('reads tax from the property, including a padded state code', () => {
    expect(taxContextOf({ state: ' ny ', taxJurisdiction: 'New York County', taxExempt: false })).toEqual({
      state: 'NY',
      jurisdiction: 'New York County',
      exempt: false,
    })
    expect(taxContextOf({ state: 'NJ', taxJurisdiction: null, taxExempt: true })).toEqual({
      state: 'NJ',
      jurisdiction: null,
      exempt: true,
    })
    expect(taxContextOf({ state: 'CA', taxJurisdiction: null, taxExempt: false })).toBeNull()
  })

  it('uses the property billing contact, then the customer billing contact', () => {
    expect(resolveInvoiceRecipient({ customerBilling: ap, propertyBilling: frank })).toEqual({
      ...frank,
      source: 'property',
    })
    expect(resolveInvoiceRecipient({ customerBilling: ap, propertyBilling: null })).toEqual({
      ...ap,
      source: 'customer',
    })
    expect(resolveInvoiceRecipient({ customerBilling: null, propertyBilling: null })).toBeNull()
  })

  it('describes tax, the invoice recipient, and contact roles', () => {
    expect(taxContextLabel({ state: 'NY', jurisdiction: 'New York County', exempt: false }))
      .toBe('Tax context: New York, New York County')
    expect(taxContextLabel({ state: 'NJ', jurisdiction: null, exempt: true }))
      .toBe('Tax context: New Jersey, tax exempt')
    expect(invoiceRecipientLabel({ ...frank, source: 'property' }))
      .toBe('Invoices go to Frank Russo (billing contact for this property) — +12125550101.')
    expect(invoiceRecipientLabel(null)).toBe('Add a billing contact before sending an invoice.')
    expect(formatPropertyAddress({
      addressLine1: '30 Montgomery St',
      addressLine2: 'Suite 4',
      city: 'Jersey City',
      state: 'NJ',
      postalCode: '07302',
    })).toBe('30 Montgomery St, Suite 4, Jersey City, NJ 07302')

    const roles = contactRoles('frank', {
      billingContactId: 'ap',
      properties: [
        {
          name: 'Manhattan',
          addressLine1: '250 W 34th St',
          siteContactId: 'frank',
          billingContactId: null,
          archivedAt: null,
        },
        {
          name: 'Closed site',
          addressLine1: '1 Old Rd',
          siteContactId: 'frank',
          billingContactId: 'frank',
          archivedAt: '2026-11-02T00:00:00.000Z',
        },
      ],
    })
    expect(roles).toEqual(['Site contact for Manhattan'])
    expect(contactRoles('ap', {
      billingContactId: 'ap',
      properties: [],
    })).toEqual(['Customer billing contact'])
  })
})

describe('customer schemas', () => {
  it('accepts a customer with a normalized contact and a New York property', () => {
    const parsed = customerCreateSchema.parse({
      name: '  Hudson   Plaza ',
      type: 'COMMERCIAL',
      notes: '',
      isContract: true,
      contact: {
        name: 'Accounts Payable',
        email: ' AP@Example.com ',
        phone: '(212) 555-0100',
      },
      property: {
        addressLine1: '250 W 34th St',
        city: 'New York',
        state: 'ny',
        postalCode: '10119-0001',
        taxExempt: false,
      },
    })
    expect(parsed.name).toBe('Hudson Plaza')
    expect(parsed.notes).toBeNull()
    expect(parsed.contact?.email).toBe('ap@example.com')
    expect(parsed.contact?.title).toBeNull()
    expect(parsed.property?.state).toBe('NY')
    expect(parsed.property?.postalCode).toBe('10119-0001')
    expect(parsed.property?.taxJurisdiction).toBeNull()
  })

  it('rejects a state outside New York and New Jersey, a bad ZIP, and a short phone', () => {
    const parsed = customerCreateSchema.safeParse({
      name: '',
      type: 'OTHER',
      isContract: false,
      contact: { name: 'Ada', phone: '123', email: 'not-an-email' },
      property: {
        addressLine1: '1 Main',
        city: 'Albany',
        state: 'CA',
        postalCode: 'ABCDE',
        taxExempt: false,
      },
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const fields = formFieldErrors(parsed.error)
      expect(fields.name).toBe('Enter a customer name.')
      expect(fields.type).toBe('Choose commercial or residential.')
      expect(fields['contact.phone']).toBe('Enter a phone number with at least 7 digits.')
      expect(fields['contact.email']).toBe('Enter a valid email address.')
      expect(fields['property.state']).toBe('Choose New York or New Jersey.')
      expect(fields['property.postalCode']).toBe('Enter a 5-digit ZIP code.')
    }
  })

  it('treats a blank billing contact as none and rejects another id shape', () => {
    expect(customerUpdateSchema.parse({
      name: 'Maria Lopez',
      type: 'RESIDENTIAL',
      notes: null,
      isContract: false,
      billingContactId: '  ',
    }).billingContactId).toBeNull()
    expect(propertyInputSchema.safeParse({
      addressLine1: '18 Maple Ave',
      city: 'Hoboken',
      state: 'NJ',
      postalCode: '07030',
      taxExempt: false,
      siteContactId: 'not-a-uuid',
      billingContactId: null,
    }).success).toBe(false)
  })

  it('trims the list search and reads the archived flag', () => {
    expect(customerListQuerySchema.parse({ q: '  Hudson ', archived: '1' })).toEqual({
      q: 'Hudson',
      archived: true,
    })
    expect(customerListQuerySchema.parse({}).archived).toBe(false)
    expect(customerListQuerySchema.safeParse({ q: 'a'.repeat(121) }).success).toBe(false)
    expect(contactInputSchema.parse({ name: 'Ada' }).email).toBeNull()
  })
})
