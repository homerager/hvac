import { createError } from 'h3'
import type { Prisma } from '../generated/prisma/client'
import type { AppPrismaClient } from '../utils/prisma'
import { usePrisma } from '../utils/prisma'
import {
  isUuid,
  resolveInvoiceRecipient,
  taxContextOf,
  type ContactInput,
  type ContactRecord,
  type ContactRef,
  type CustomerCreateInput,
  type CustomerDetail,
  type CustomerList,
  type CustomerListQuery,
  type CustomerUpdateInput,
  type PropertyInput,
  type PropertyRecord,
} from '../../shared/utils/customers'

// One customer, many properties. Each property carries its own NY/NJ tax context.
// The invoice recipient is the property billing contact, or the customer billing contact.

const LIST_LIMIT = 100

const detailInclude = {
  contacts: { orderBy: { name: 'asc' as const } },
  properties: { orderBy: [{ archivedAt: 'asc' as const }, { addressLine1: 'asc' as const }] },
} satisfies Prisma.CustomerInclude

type Tx = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof detailInclude }>

export async function listCustomers(query: CustomerListQuery): Promise<CustomerList> {
  const rows = await usePrisma().customer.findMany({
    where: {
      archivedAt: query.archived ? undefined : null,
      ...searchWhere(query.q),
    },
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    take: LIST_LIMIT + 1,
    select: {
      id: true,
      name: true,
      type: true,
      isContract: true,
      archivedAt: true,
      billingContact: { select: { name: true } },
      _count: { select: { contacts: true } },
      properties: {
        where: { archivedAt: null },
        select: { id: true },
      },
    },
  })
  const page = rows.slice(0, LIST_LIMIT)
  return {
    truncated: rows.length > LIST_LIMIT,
    customers: page.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      isContract: row.isContract,
      archivedAt: iso(row.archivedAt),
      activePropertyCount: row.properties.length,
      contactCount: row._count.contacts,
      billingContactName: row.billingContact?.name ?? null,
    })),
  }
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  if (!isUuid(id)) notFound()
  const row = await usePrisma().customer.findUnique({ where: { id }, include: detailInclude })
  if (!row) notFound()
  return toDetail(row)
}

export async function createCustomer(input: CustomerCreateInput): Promise<CustomerDetail> {
  const id = await usePrisma().$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: input.name,
        type: input.type,
        notes: input.notes,
        isContract: input.isContract,
      },
    })
    const contact = input.contact
      ? await tx.contact.create({
          data: {
            customerId: customer.id,
            name: input.contact.name,
            title: input.contact.title,
            email: input.contact.email,
            phone: input.contact.phone,
            notes: input.contact.notes,
          },
        })
      : null
    if (contact) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { billingContactId: contact.id },
      })
    }
    if (input.property) {
      await tx.property.create({
        data: {
          customerId: customer.id,
          name: input.property.name,
          addressLine1: input.property.addressLine1,
          addressLine2: input.property.addressLine2,
          city: input.property.city,
          state: input.property.state,
          postalCode: input.property.postalCode,
          taxJurisdiction: input.property.taxJurisdiction,
          taxExempt: input.property.taxExempt,
          accessNotes: input.property.accessNotes,
          siteContactId: contact?.id ?? null,
        },
      })
    }
    return customer.id
  })
  return getCustomer(id)
}

export async function updateCustomer(id: string, input: CustomerUpdateInput): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, id)
    await assertOwnContacts(tx, id, [input.billingContactId])
    await tx.customer.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        notes: input.notes,
        isContract: input.isContract,
        billingContactId: input.billingContactId,
      },
    })
  })
  return getCustomer(id)
}

export async function archiveCustomer(id: string): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, id)
    await tx.customer.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    })
  })
  return getCustomer(id)
}

export async function restoreCustomer(id: string): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, id)
    await tx.customer.updateMany({
      where: { id, archivedAt: { not: null } },
      data: { archivedAt: null },
    })
  })
  return getCustomer(id)
}

export async function createContact(customerId: string, input: ContactInput): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await tx.contact.create({
      data: {
        customerId,
        name: input.name,
        title: input.title,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      },
    })
  })
  return getCustomer(customerId)
}

export async function updateContact(customerId: string, contactId: string, input: ContactInput): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await requireContact(tx, customerId, contactId)
    await tx.contact.update({
      where: { id: contactId },
      data: {
        name: input.name,
        title: input.title,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      },
    })
  })
  return getCustomer(customerId)
}

export async function deleteContact(customerId: string, contactId: string): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await requireContact(tx, customerId, contactId)
    const [customer, properties] = await Promise.all([
      tx.customer.findUnique({ where: { id: customerId }, select: { billingContactId: true } }),
      tx.property.findMany({
        where: {
          customerId,
          OR: [{ siteContactId: contactId }, { billingContactId: contactId }],
        },
        select: { id: true },
      }),
    ])
    if (customer?.billingContactId === contactId || properties.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This contact is still assigned as a billing or site contact. Choose someone else, then remove them.',
      })
    }
    await tx.contact.delete({ where: { id: contactId } })
  })
  return getCustomer(customerId)
}

export async function createProperty(customerId: string, input: PropertyInput): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await assertOwnContacts(tx, customerId, [input.siteContactId, input.billingContactId])
    await tx.property.create({ data: propertyData(customerId, input) })
  })
  return getCustomer(customerId)
}

export async function updateProperty(customerId: string, propertyId: string, input: PropertyInput): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await requireProperty(tx, customerId, propertyId)
    await assertOwnContacts(tx, customerId, [input.siteContactId, input.billingContactId])
    await tx.property.update({
      where: { id: propertyId },
      data: propertyData(customerId, input),
    })
  })
  return getCustomer(customerId)
}

export async function archiveProperty(customerId: string, propertyId: string): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await requireProperty(tx, customerId, propertyId)
    await tx.property.updateMany({
      where: { id: propertyId, customerId, archivedAt: null },
      data: { archivedAt: new Date() },
    })
  })
  return getCustomer(customerId)
}

export async function restoreProperty(customerId: string, propertyId: string): Promise<CustomerDetail> {
  await usePrisma().$transaction(async (tx) => {
    await lockCustomer(tx, customerId)
    await requireProperty(tx, customerId, propertyId)
    await tx.property.updateMany({
      where: { id: propertyId, customerId, archivedAt: { not: null } },
      data: { archivedAt: null },
    })
  })
  return getCustomer(customerId)
}

function propertyData(customerId: string, input: PropertyInput): Prisma.PropertyUncheckedCreateInput {
  return {
    customerId,
    name: input.name,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    taxJurisdiction: input.taxJurisdiction,
    taxExempt: input.taxExempt,
    accessNotes: input.accessNotes,
    siteContactId: input.siteContactId,
    billingContactId: input.billingContactId,
  }
}

function toDetail(row: CustomerRow): CustomerDetail {
  const contacts = row.contacts.map(toContact)
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  const customerBilling = contactRef(byId, row.billingContactId)
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    notes: row.notes,
    isContract: row.isContract,
    billingContactId: row.billingContactId,
    archivedAt: iso(row.archivedAt),
    contacts,
    properties: row.properties.map((property) => {
      const tax = taxContextOf(property)
      if (!tax) {
        throw createError({
          statusCode: 500,
          statusMessage: 'This property has a tax state outside New York and New Jersey.',
        })
      }
      const record: PropertyRecord = {
        id: property.id,
        name: property.name,
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2,
        city: property.city,
        state: tax.state,
        postalCode: property.postalCode,
        taxJurisdiction: property.taxJurisdiction,
        taxExempt: property.taxExempt,
        accessNotes: property.accessNotes,
        siteContactId: property.siteContactId,
        billingContactId: property.billingContactId,
        archivedAt: iso(property.archivedAt),
        tax,
        invoiceRecipient: resolveInvoiceRecipient({
          customerBilling,
          propertyBilling: contactRef(byId, property.billingContactId),
        }),
      }
      return record
    }),
  }
}

function toContact(contact: CustomerRow['contacts'][number]): ContactRecord {
  return {
    id: contact.id,
    name: contact.name,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
  }
}

function contactRef(contacts: Map<string, ContactRecord>, id: string | null): ContactRef | null {
  if (!id) return null
  const contact = contacts.get(id)
  if (!contact) return null
  return { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone }
}

async function lockCustomer(tx: Tx, id: string): Promise<void> {
  if (!isUuid(id)) notFound()
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Customer" WHERE id = CAST(${id} AS uuid) FOR UPDATE
  `
  if (rows.length === 0) notFound()
}

async function requireContact(tx: Tx, customerId: string, contactId: string): Promise<void> {
  if (!isUuid(contactId)) contactNotFound()
  const contact = await tx.contact.findFirst({
    where: { id: contactId, customerId },
    select: { id: true },
  })
  if (!contact) contactNotFound()
}

async function requireProperty(tx: Tx, customerId: string, propertyId: string): Promise<void> {
  if (!isUuid(propertyId)) propertyNotFound()
  const property = await tx.property.findFirst({
    where: { id: propertyId, customerId },
    select: { id: true },
  })
  if (!property) propertyNotFound()
}

async function assertOwnContacts(tx: Tx, customerId: string, ids: Array<string | null>): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return
  const found = await tx.contact.findMany({
    where: { customerId, id: { in: wanted } },
    select: { id: true },
  })
  if (found.length !== wanted.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choose a contact that belongs to this customer.',
    })
  }
}

function searchWhere(q: string): Prisma.CustomerWhereInput {
  if (!q) return {}
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { contacts: { some: { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ] } } },
      { properties: { some: { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { addressLine1: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { postalCode: { contains: q, mode: 'insensitive' } },
      ] } } },
    ],
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function notFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Customer not found.' })
}

function contactNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Contact not found.' })
}

function propertyNotFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Property not found.' })
}
