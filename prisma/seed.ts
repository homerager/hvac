import { existsSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../server/generated/prisma/client'
import type { Prisma } from '../server/generated/prisma/client'

// Safe to re-run: every write is an upsert keyed on a unique field, and existing rows are never overwritten
// (settings edited by the client stay as they are).

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

const seedDemo = process.env.SEED_DEMO
  ? process.env.SEED_DEMO === '1'
  : process.env.NODE_ENV !== 'production'

// Values the client has not decided yet stay null: no discovery defaults (BR-07, open items #3-#5).
const settings: Record<string, Prisma.InputJsonValue> = {
  'company': {
    legalName: null,
    displayName: 'Servora HVAC',
    phone: null,
    email: null,
    address: null,
    licenseNumbers: [],
  },
  'branding': {
    theme: 'blue',
    logoAttachmentId: null,
  },
  'service-call': {
    amountCents: null,
    includedMinutes: null,
    exemptContractCustomers: null,
    waiveRoles: [],
  },
  'invoice': {
    requireOwnerApproval: null,
    approvalFallbackRole: null,
    numberFormat: null,
    paymentTermsDays: null,
  },
}

const ids = {
  hudson: '0192f000-0000-7000-8000-000000000001',
  lopez: '0192f000-0000-7000-8000-000000000002',
  hudsonAp: '0192f000-0000-7000-8000-000000000101',
  hudsonSuper: '0192f000-0000-7000-8000-000000000102',
  lopezMaria: '0192f000-0000-7000-8000-000000000103',
  hudsonManhattan: '0192f000-0000-7000-8000-000000000201',
  hudsonJerseyCity: '0192f000-0000-7000-8000-000000000202',
  lopezHome: '0192f000-0000-7000-8000-000000000203',
  rtu1: '0192f000-0000-7000-8000-000000000301',
  furnace: '0192f000-0000-7000-8000-000000000302',
  scheduledJob: '0192f000-0000-7000-8000-000000000401',
}

async function seedSettings() {
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
}

async function seedUsers() {
  const users = [
    { email: 'superadmin@example.com', name: 'Super Admin', role: 'SUPER_ADMIN' },
    { email: 'owner@example.com', name: 'Olivia Owner', role: 'OWNER' },
    { email: 'dispatch@example.com', name: 'Dana Dispatcher', role: 'DISPATCHER' },
    { email: 'tech1@example.com', name: 'Tom Technician', role: 'TECHNICIAN' },
    { email: 'tech2@example.com', name: 'Tara Technician', role: 'TECHNICIAN' },
  ] as const

  const byEmail: Record<string, string> = {}
  for (const user of users) {
    const row = await prisma.user.upsert({ where: { email: user.email }, create: user, update: {} })
    byEmail[user.email] = row.id
  }
  return byEmail
}

async function seedCustomers() {
  await prisma.customer.upsert({
    where: { id: ids.hudson },
    create: { id: ids.hudson, name: 'Hudson Plaza Management', type: 'COMMERCIAL', isContract: true },
    update: {},
  })
  await prisma.customer.upsert({
    where: { id: ids.lopez },
    create: { id: ids.lopez, name: 'Maria Lopez', type: 'RESIDENTIAL' },
    update: {},
  })

  const contacts = [
    { id: ids.hudsonAp, customerId: ids.hudson, name: 'Accounts Payable', email: 'ap@hudsonplaza.example.com', phone: '+12125550100' },
    { id: ids.hudsonSuper, customerId: ids.hudson, name: 'Frank Russo', title: 'Building Superintendent', phone: '+12125550101' },
    { id: ids.lopezMaria, customerId: ids.lopez, name: 'Maria Lopez', email: 'maria.lopez@example.com', phone: '+12015550102' },
  ]
  for (const contact of contacts) {
    await prisma.contact.upsert({ where: { id: contact.id }, create: contact, update: {} })
  }

  await prisma.customer.updateMany({
    where: { id: ids.hudson, billingContactId: null },
    data: { billingContactId: ids.hudsonAp },
  })
  await prisma.customer.updateMany({
    where: { id: ids.lopez, billingContactId: null },
    data: { billingContactId: ids.lopezMaria },
  })

  const properties = [
    {
      id: ids.hudsonManhattan,
      customerId: ids.hudson,
      name: 'Hudson Plaza — Manhattan',
      addressLine1: '250 W 34th St',
      city: 'New York',
      state: 'NY',
      postalCode: '10119',
      siteContactId: ids.hudsonSuper,
      accessNotes: 'Roof access via freight elevator; check in at security desk.',
    },
    {
      id: ids.hudsonJerseyCity,
      customerId: ids.hudson,
      name: 'Hudson Plaza — Jersey City',
      addressLine1: '30 Montgomery St',
      city: 'Jersey City',
      state: 'NJ',
      postalCode: '07302',
      siteContactId: ids.hudsonSuper,
    },
    {
      id: ids.lopezHome,
      customerId: ids.lopez,
      addressLine1: '18 Maple Ave',
      city: 'Hoboken',
      state: 'NJ',
      postalCode: '07030',
      siteContactId: ids.lopezMaria,
    },
  ]
  for (const property of properties) {
    await prisma.property.upsert({ where: { id: property.id }, create: property, update: {} })
  }

  const equipment = [
    {
      id: ids.rtu1,
      propertyId: ids.hudsonManhattan,
      type: 'Rooftop unit',
      manufacturer: 'Carrier',
      model: '48FC',
      serialNumber: 'DEMO-RTU-0001',
      location: 'Roof, north side',
    },
    {
      id: ids.furnace,
      propertyId: ids.lopezHome,
      type: 'Gas furnace',
      manufacturer: 'Lennox',
      model: 'EL296V',
      location: 'Basement',
    },
  ]
  for (const unit of equipment) {
    await prisma.equipment.upsert({ where: { id: unit.id }, create: unit, update: {} })
  }
}

async function seedWork(users: Record<string, string>) {
  const apiRequest = await prisma.request.upsert({
    where: { idempotencyKey: 'demo-web-form-0001' },
    create: {
      source: 'API',
      status: 'CONVERTED',
      idempotencyKey: 'demo-web-form-0001',
      rawPayload: { form: 'website-contact', name: 'Frank Russo', message: 'RTU on the roof is blowing warm air' },
      contactName: 'Frank Russo',
      contactPhone: '+12125550101',
      address: '250 W 34th St, New York, NY 10119',
      description: 'Rooftop unit is blowing warm air on floors 10-12.',
      customerId: ids.hudson,
      propertyId: ids.hudsonManhattan,
    },
    update: {},
  })

  await prisma.request.upsert({
    where: { idempotencyKey: 'demo-manual-0002' },
    create: {
      source: 'MANUAL',
      idempotencyKey: 'demo-manual-0002',
      contactName: 'Maria Lopez',
      contactPhone: '+12015550102',
      description: 'Furnace makes a loud noise on startup.',
      preferredWindow: 'Weekday mornings',
      customerId: ids.lopez,
      propertyId: ids.lopezHome,
      createdById: users['dispatch@example.com'],
    },
    update: {},
  })

  const start = new Date()
  start.setUTCDate(start.getUTCDate() + 1)
  start.setUTCHours(13, 0, 0, 0)
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)

  await prisma.job.upsert({
    where: { id: ids.scheduledJob },
    create: {
      id: ids.scheduledJob,
      status: 'SCHEDULED',
      priority: 'HIGH',
      title: 'RTU not cooling',
      description: apiRequest.description,
      requestId: apiRequest.id,
      customerId: ids.hudson,
      propertyId: ids.hudsonManhattan,
      scheduledStart: start,
      scheduledEnd: end,
      assignedToId: users['tech1@example.com'],
      collaborators: { connect: [{ id: users['tech2@example.com'] }] },
      equipment: { connect: [{ id: ids.rtu1 }] },
      createdById: users['dispatch@example.com'],
    },
    update: {},
  })
}

async function main() {
  await seedSettings()
  if (seedDemo) {
    const users = await seedUsers()
    await seedCustomers()
    await seedWork(users)
  }
  console.log(`Seed complete (demo data: ${seedDemo ? 'yes' : 'no'})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
