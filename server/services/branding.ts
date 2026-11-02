import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { Prisma } from '../generated/prisma/client'
import {
  inspectLogo,
  parseBrandingSetting,
  parseCompanySetting,
  type BrandingSetting,
  type CompanySetting,
  type CompanySettingsInput,
  type PublicBranding,
} from '../../shared/utils/branding'
import { usePrisma, type AppPrismaClient } from '../utils/prisma'
import { deleteStoredFile, readStoredFile, writeStoredFile } from './uploads'

const COMPANY_KEY = 'company'
const BRANDING_KEY = 'branding'

type Tx = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]

/** Company mark for every page, including the sign-in screen. */
export async function getPublicBranding(): Promise<PublicBranding> {
  const prisma = usePrisma()
  const rows = await prisma.setting.findMany({
    where: { key: { in: [COMPANY_KEY, BRANDING_KEY] } },
  })
  const companyRow = rows.find(row => row.key === COMPANY_KEY)
  const brandingRow = rows.find(row => row.key === BRANDING_KEY)
  const company = parseCompanySetting(companyRow?.value)
  const branding = parseBrandingSetting(brandingRow?.value)
  const logo = await currentLogo(prisma, branding)
  return {
    company,
    theme: branding.theme,
    logoUrl: logo ? `/api/branding/logo?v=${logo.id}` : null,
  }
}

export async function readCompanyLogo(): Promise<{ bytes: Buffer, contentType: string } | null> {
  const prisma = usePrisma()
  const row = await prisma.setting.findUnique({ where: { key: BRANDING_KEY } })
  const branding = parseBrandingSetting(row?.value)
  const logo = await currentLogo(prisma, branding)
  if (!logo) return null
  const bytes = await readStoredFile(logo.storageKey)
  if (!bytes) return null
  return { bytes, contentType: logo.contentType }
}

export async function saveCompanySettings(input: CompanySettingsInput, actorId: string): Promise<PublicBranding> {
  const company: CompanySetting = {
    legalName: input.legalName,
    displayName: input.displayName,
    phone: input.phone,
    email: input.email,
    address: input.address,
    licenseNumbers: input.licenseNumbers,
  }
  await usePrisma().$transaction(async (tx) => {
    await lockSettings(tx)
    await tx.setting.upsert({
      where: { key: COMPANY_KEY },
      create: { key: COMPANY_KEY, value: asJson(company), updatedById: actorId },
      update: { value: asJson(company), updatedById: actorId },
    })
    const existing = await tx.setting.findUnique({ where: { key: BRANDING_KEY } })
    const branding = parseBrandingSetting(existing?.value)
    const next: BrandingSetting = { theme: input.theme, logoAttachmentId: branding.logoAttachmentId }
    await tx.setting.upsert({
      where: { key: BRANDING_KEY },
      create: { key: BRANDING_KEY, value: asJson(next), updatedById: actorId },
      update: { value: asJson(next), updatedById: actorId },
    })
  })
  return getPublicBranding()
}

export async function replaceCompanyLogo(input: {
  bytes: Uint8Array
  fileName?: string
  actorId: string
}): Promise<PublicBranding> {
  const inspected = inspectLogo({ bytes: input.bytes, fileName: input.fileName })
  if (!inspected.ok) {
    throw createError({ statusCode: inspected.statusCode, statusMessage: inspected.message })
  }

  const storageKey = `logos/${randomUUID()}`
  await writeStoredFile(storageKey, input.bytes)
  const staleKeys: string[] = []
  try {
    await usePrisma().$transaction(async (tx) => {
      await lockSettings(tx)
      const attachment = await tx.attachment.create({
        data: {
          kind: 'LOGO',
          storageKey,
          fileName: inspected.fileName,
          contentType: inspected.contentType,
          sizeBytes: input.bytes.byteLength,
          uploadedById: input.actorId,
        },
      })
      const existing = await tx.setting.findUnique({ where: { key: BRANDING_KEY } })
      const branding = parseBrandingSetting(existing?.value)
      const next: BrandingSetting = { theme: branding.theme, logoAttachmentId: attachment.id }
      await tx.setting.upsert({
        where: { key: BRANDING_KEY },
        create: { key: BRANDING_KEY, value: asJson(next), updatedById: input.actorId },
        update: { value: asJson(next), updatedById: input.actorId },
      })
      const stale = await tx.attachment.findMany({
        where: { kind: 'LOGO', id: { not: attachment.id } },
        select: { storageKey: true },
      })
      staleKeys.push(...stale.map(row => row.storageKey))
      await tx.attachment.deleteMany({ where: { kind: 'LOGO', id: { not: attachment.id } } })
    })
  }
  catch (error) {
    await deleteStoredFile(storageKey).catch(() => undefined)
    throw error
  }

  await deleteStoredKeys(staleKeys)
  return getPublicBranding()
}

export async function clearCompanyLogo(actorId: string): Promise<PublicBranding> {
  const staleKeys: string[] = []
  await usePrisma().$transaction(async (tx) => {
    await lockSettings(tx)
    const existing = await tx.setting.findUnique({ where: { key: BRANDING_KEY } })
    const branding = parseBrandingSetting(existing?.value)
    const next: BrandingSetting = { theme: branding.theme, logoAttachmentId: null }
    await tx.setting.upsert({
      where: { key: BRANDING_KEY },
      create: { key: BRANDING_KEY, value: asJson(next), updatedById: actorId },
      update: { value: asJson(next), updatedById: actorId },
    })
    const stale = await tx.attachment.findMany({
      where: { kind: 'LOGO' },
      select: { storageKey: true },
    })
    staleKeys.push(...stale.map(row => row.storageKey))
    await tx.attachment.deleteMany({ where: { kind: 'LOGO' } })
  })
  await deleteStoredKeys(staleKeys)
  return getPublicBranding()
}

async function currentLogo(prisma: AppPrismaClient, branding: BrandingSetting) {
  if (!branding.logoAttachmentId) return null
  return prisma.attachment.findFirst({
    where: {
      id: branding.logoAttachmentId,
      kind: 'LOGO',
      deletedAt: null,
      contentType: { in: ['image/png', 'image/jpeg', 'image/webp'] },
    },
    select: { id: true, storageKey: true, contentType: true },
  })
}

async function lockSettings(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT key FROM "Setting" WHERE key IN ('company', 'branding') FOR UPDATE`
}

async function deleteStoredKeys(keys: string[]): Promise<void> {
  await Promise.all(keys.map(async (key) => {
    try {
      await deleteStoredFile(key)
    }
    catch {
      // The database row is already gone. A leftover object can be removed later.
    }
  }))
}

function asJson(value: CompanySetting | BrandingSetting): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
