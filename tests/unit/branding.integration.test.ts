import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { AttachmentKind, Prisma } from '../../server/generated/prisma/client'
import {
  clearCompanyLogo,
  getPublicBranding,
  readCompanyLogo,
  replaceCompanyLogo,
  saveCompanySettings,
} from '../../server/services/branding'
import { readStoredFile } from '../../server/services/uploads'
import { withAudit } from '../../server/utils/audit-context'
import { usePrisma } from '../../server/utils/prisma'
import { hashPassword } from '../../server/services/password'
import type { CompanySettingsInput } from '../../shared/utils/branding'

const describeDb = process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD ? describe : describe.skip

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describeDb('company branding', () => {
  const email = `branding-${randomUUID()}@example.com`
  const startedAt = new Date(Date.now() - 1000)
  let userId = ''
  let uploadDir = ''
  let originalCompany: { value: Prisma.JsonValue, updatedById: string | null } | null = null
  let originalBranding: { value: Prisma.JsonValue, updatedById: string | null } | null = null
  let originalLogo: LogoRow | null = null
  const previousUploadDir = process.env.UPLOAD_DIR

  afterAll(async () => {
    const prisma = usePrisma()
    if (originalCompany) {
      await prisma.setting.update({
        where: { key: 'company' },
        data: { value: asJson(originalCompany.value), updatedById: originalCompany.updatedById },
      })
    }
    if (originalBranding) {
      await prisma.setting.update({
        where: { key: 'branding' },
        data: { value: asJson(originalBranding.value), updatedById: originalBranding.updatedById },
      })
    }
    if (userId) await prisma.attachment.deleteMany({ where: { uploadedById: userId } })
    if (originalLogo && !await prisma.attachment.findUnique({ where: { id: originalLogo.id } })) {
      await prisma.attachment.create({ data: originalLogo })
    }
    await prisma.auditLog.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        OR: [
          { actorId: userId },
          { entityType: 'Setting', actorId: null },
        ],
      },
    })
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true })
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR
    else process.env.UPLOAD_DIR = previousUploadDir
    await prisma.$disconnect()
  })

  it('saves company details and a logo without serving any other file', async () => {
    const prisma = usePrisma()
    uploadDir = await mkdtemp(join(tmpdir(), 'hvac-branding-'))
    process.env.UPLOAD_DIR = uploadDir

    const [companyRow, brandingRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'company' } }),
      prisma.setting.findUnique({ where: { key: 'branding' } }),
    ])
    originalCompany = companyRow ? { value: companyRow.value, updatedById: companyRow.updatedById } : null
    originalBranding = brandingRow ? { value: brandingRow.value, updatedById: brandingRow.updatedById } : null
    originalLogo = await prisma.attachment.findFirst({
      where: { kind: 'LOGO' },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        caption: true,
        uploadedById: true,
        jobId: true,
        workEntryId: true,
        equipmentId: true,
        deletedAt: true,
      },
    })

    const user = await prisma.user.create({
      data: {
        email,
        name: 'Branding Admin',
        role: 'SUPER_ADMIN',
        passwordHash: await hashPassword('ServoraDemo!'),
      },
    })
    userId = user.id

    const marker = `Brand ${randomUUID().slice(0, 8)}`
    const input: CompanySettingsInput = {
      legalName: `${marker} LLC`,
      displayName: marker,
      phone: '2125550199',
      email: 'ap@brand-test.example',
      address: '9 River Rd\nJersey City, NJ',
      licenseNumbers: ['HT-42'],
      theme: 'navy',
    }

    const saved = await withAudit({ actorId: user.id }, () => saveCompanySettings(input, user.id))
    expect(saved.company).toMatchObject({
      displayName: marker,
      legalName: `${marker} LLC`,
      licenseNumbers: ['HT-42'],
    })
    expect(saved.theme).toBe('navy')
    expect(saved.logoUrl).toBeNull()
    expect((await prisma.setting.findUnique({ where: { key: 'company' } }))?.updatedById).toBe(user.id)

    const companyLog = await prisma.auditLog.findFirst({
      where: { entityType: 'Setting', entityId: 'company', actorId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(companyLog?.action).toBe('setting.upsert')
    expect(companyLog?.after).toMatchObject({ value: { displayName: marker } })

    const other = await prisma.attachment.create({
      data: {
        kind: 'DOCUMENT',
        storageKey: `documents/${randomUUID()}`,
        fileName: 'secret.pdf',
        contentType: 'application/pdf',
        sizeBytes: 4,
        uploadedById: user.id,
      },
    })
    await prisma.setting.update({
      where: { key: 'branding' },
      data: { value: { theme: 'navy', logoAttachmentId: other.id } },
    })
    expect((await getPublicBranding()).logoUrl).toBeNull()
    expect(await readCompanyLogo()).toBeNull()

    const uploaded = await withAudit({ actorId: user.id }, () => replaceCompanyLogo({
      bytes: PNG,
      fileName: 'mark.png',
      actorId: user.id,
    }))
    expect(uploaded.logoUrl).toMatch(/^\/api\/branding\/logo\?v=/)
    expect(uploaded.theme).toBe('navy')
    const stored = await readCompanyLogo()
    expect(stored?.contentType).toBe('image/png')
    expect(stored?.bytes.equals(PNG)).toBe(true)
    const firstLogo = await prisma.attachment.findFirst({ where: { kind: 'LOGO' }, select: { storageKey: true } })
    expect(firstLogo?.storageKey).toMatch(/^logos\//)

    const replaced = await replaceCompanyLogo({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      fileName: 'next.jpeg',
      actorId: user.id,
    })
    expect(replaced.logoUrl).not.toBe(uploaded.logoUrl)
    expect((await readCompanyLogo())?.contentType).toBe('image/jpeg')
    expect(await prisma.attachment.count({ where: { kind: 'LOGO' } })).toBe(1)
    expect(await readStoredFile(firstLogo!.storageKey)).toBeNull()

    const kept = await saveCompanySettings({ ...input, theme: 'green' }, user.id)
    expect(kept.theme).toBe('green')
    expect(kept.logoUrl).toBe(replaced.logoUrl)

    await expect(replaceCompanyLogo({
      bytes: Uint8Array.from([0x3c, 0x73, 0x76, 0x67]),
      actorId: user.id,
    })).rejects.toMatchObject({ statusCode: 400 })

    const currentLogo = await prisma.attachment.findFirst({ where: { kind: 'LOGO' }, select: { storageKey: true } })
    const cleared = await clearCompanyLogo(user.id)
    expect(cleared.logoUrl).toBeNull()
    expect(cleared.theme).toBe('green')
    expect(await readCompanyLogo()).toBeNull()
    expect(await prisma.attachment.count({ where: { kind: 'LOGO', uploadedById: user.id } })).toBe(0)
    expect(await readStoredFile(currentLogo!.storageKey)).toBeNull()
  }, 30_000)
})

type LogoRow = {
  id: string
  kind: AttachmentKind
  storageKey: string
  fileName: string
  contentType: string
  sizeBytes: number
  caption: string | null
  uploadedById: string
  jobId: string | null
  workEntryId: string | null
  equipmentId: string | null
  deletedAt: Date | null
}

function asJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
