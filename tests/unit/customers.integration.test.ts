import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  archiveCustomer,
  createContact,
  createCustomer,
  createProperty,
  deleteContact,
  listCustomers,
  updateCustomer,
  updateProperty,
} from '../../server/services/customers'
import { usePrisma } from '../../server/utils/prisma'
import {
  contactInputSchema,
  customerCreateSchema,
  customerUpdateSchema,
  propertyInputSchema,
} from '../../shared/utils/customers'

const describeDb = process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD ? describe : describe.skip

describeDb('customers, contacts, and properties', () => {
  const createdIds: string[] = []

  afterAll(async () => {
    const prisma = usePrisma()
    if (createdIds.length > 0) {
      await prisma.property.deleteMany({ where: { customerId: { in: createdIds } } })
      await prisma.customer.deleteMany({ where: { id: { in: createdIds } } })
    }
    await prisma.$disconnect()
  })

  it('keeps a separate tax context and billing contact for each property', async () => {
    const marker = `IT ${randomUUID().slice(0, 8)}`
    const created = await createCustomer(customerCreateSchema.parse({
      name: `${marker} Holdings`,
      type: 'COMMERCIAL',
      notes: '',
      isContract: true,
      contact: {
        name: 'Accounts Payable',
        email: 'AP@Example.com',
        phone: '2125550100',
      },
      property: {
        name: 'Manhattan roof',
        addressLine1: '250 W 34th St',
        city: 'New York',
        state: 'ny',
        postalCode: '10119',
        taxJurisdiction: 'New York County',
        taxExempt: false,
        accessNotes: 'Roof hatch',
      },
    }))
    createdIds.push(created.id)

    const billing = created.contacts[0]
    expect(billing?.email).toBe('ap@example.com')
    expect(created.billingContactId).toBe(billing?.id)
    expect(created.isContract).toBe(true)
    expect(created.properties).toHaveLength(1)
    expect(created.properties[0]).toMatchObject({
      state: 'NY',
      siteContactId: billing?.id,
      tax: { state: 'NY', jurisdiction: 'New York County', exempt: false },
      invoiceRecipient: { name: 'Accounts Payable', source: 'customer' },
    })

    const withSite = await createContact(created.id, contactInputSchema.parse({
      name: 'Frank Russo',
      title: 'Superintendent',
      phone: '+1 212 555 0101',
    }))
    const site = withSite.contacts.find(contact => contact.name === 'Frank Russo')
    expect(site).toBeTruthy()

    const twoSites = await createProperty(created.id, propertyInputSchema.parse({
      name: 'Jersey City',
      addressLine1: '30 Montgomery St',
      addressLine2: 'Suite 4',
      city: 'Jersey City',
      state: 'NJ',
      postalCode: '07302',
      taxJurisdiction: 'Hudson County',
      taxExempt: true,
      siteContactId: site!.id,
      billingContactId: site!.id,
    }))
    const ny = twoSites.properties.find(property => property.state === 'NY')
    const nj = twoSites.properties.find(property => property.state === 'NJ')
    expect(ny?.tax).toEqual({ state: 'NY', jurisdiction: 'New York County', exempt: false })
    expect(nj?.tax).toEqual({ state: 'NJ', jurisdiction: 'Hudson County', exempt: true })
    expect(ny?.invoiceRecipient).toMatchObject({ name: 'Accounts Payable', source: 'customer' })
    expect(nj?.invoiceRecipient).toMatchObject({ id: site!.id, name: 'Frank Russo', source: 'property' })
    expect(nj?.addressLine2).toBe('Suite 4')

    const found = await listCustomers({ q: 'jersey city', archived: false })
    expect(found.customers.map(customer => customer.id)).toContain(created.id)

    const other = await createCustomer(customerCreateSchema.parse({
      name: `${marker} Other`,
      type: 'RESIDENTIAL',
      isContract: false,
      contact: { name: 'Other Person', email: 'other@example.com' },
    }))
    createdIds.push(other.id)
    const foreignContactId = other.contacts[0]?.id
    expect(foreignContactId).toBeTruthy()

    await expect(updateCustomer(created.id, customerUpdateSchema.parse({
      name: created.name,
      type: 'COMMERCIAL',
      notes: '',
      isContract: true,
      billingContactId: foreignContactId,
    }))).rejects.toMatchObject({ statusCode: 400 })

    await expect(updateProperty(created.id, nj!.id, propertyInputSchema.parse({
      name: 'Jersey City',
      addressLine1: '30 Montgomery St',
      city: 'Jersey City',
      state: 'NJ',
      postalCode: '07302',
      taxJurisdiction: 'Hudson County',
      taxExempt: true,
      siteContactId: foreignContactId,
      billingContactId: site!.id,
    }))).rejects.toMatchObject({ statusCode: 400 })

    await expect(deleteContact(created.id, billing!.id)).rejects.toMatchObject({ statusCode: 409 })

    const switched = await updateCustomer(created.id, customerUpdateSchema.parse({
      name: created.name,
      type: 'COMMERCIAL',
      notes: 'Net 30',
      isContract: true,
      billingContactId: site!.id,
    }))
    expect(switched.notes).toBe('Net 30')
    expect(switched.properties.find(property => property.state === 'NY')?.invoiceRecipient).toMatchObject({
      id: site!.id,
      source: 'customer',
    })
    expect(switched.properties.find(property => property.state === 'NJ')?.invoiceRecipient?.source).toBe('property')

    await updateProperty(created.id, ny!.id, propertyInputSchema.parse({
      name: 'Manhattan roof',
      addressLine1: '250 W 34th St',
      city: 'New York',
      state: 'NY',
      postalCode: '10119',
      taxJurisdiction: 'New York County',
      taxExempt: false,
      accessNotes: 'Roof hatch',
      siteContactId: site!.id,
      billingContactId: '',
    }))
    const removed = await deleteContact(created.id, billing!.id)
    expect(removed.contacts.map(contact => contact.name)).not.toContain('Accounts Payable')
    expect(removed.properties.find(property => property.state === 'NY')?.siteContactId).toBe(site!.id)

    const archived = await archiveCustomer(created.id)
    expect(archived.archivedAt).toBeTruthy()
    const hidden = await listCustomers({ q: marker, archived: false })
    expect(hidden.customers.find(customer => customer.id === created.id)).toBeUndefined()
    const shown = await listCustomers({ q: marker, archived: true })
    expect(shown.customers.find(customer => customer.id === created.id)?.activePropertyCount).toBe(2)

    await expect(usePrisma().property.create({
      data: {
        customerId: created.id,
        addressLine1: '1 Main St',
        city: 'Albany',
        state: 'CA',
        postalCode: '12207',
      },
    })).rejects.toThrow()
  })

  it('stores a customer before any property exists', async () => {
    const created = await createCustomer(customerCreateSchema.parse({
      name: `IT name only ${randomUUID().slice(0, 8)}`,
      type: 'RESIDENTIAL',
      isContract: false,
    }))
    createdIds.push(created.id)
    expect(created.contacts).toEqual([])
    expect(created.properties).toEqual([])
    expect(created.billingContactId).toBeNull()
  })
})
