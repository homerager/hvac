import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BRAND_THEME_IDS,
  BRAND_THEMES,
  companyDetailLines,
  companySettingsInputSchema,
  defaultCompany,
  inspectLogo,
  licensesFromText,
  LOGO_MAX_BYTES,
  parseBrandingSetting,
  parseCompanySetting,
  primaryColorForTheme,
  settingsFieldErrors,
} from '../../shared/utils/branding'
import { deleteStoredFile, readStoredFile, storedFilePath, writeStoredFile } from '../../server/services/uploads'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('company settings schema', () => {
  it('lists every standard theme once, with blue as the default primary', () => {
    expect(BRAND_THEME_IDS).toEqual(Object.keys(BRAND_THEMES))
    expect(new Set(BRAND_THEME_IDS).size).toBe(BRAND_THEME_IDS.length)
    expect(primaryColorForTheme('blue')).toBe('sky')
    expect(primaryColorForTheme('green')).toBe('emerald')
  })

  it('normalizes company details and drops blank optional fields', () => {
    const parsed = companySettingsInputSchema.parse({
      legalName: '  Northwind\nHVAC LLC  ',
      displayName: '  Northwind   HVAC  ',
      phone: ' +1 (212) 555-0100 ',
      email: ' Office@Northwind.example ',
      address: '  1 Main St\nNew York, NY  ',
      licenseNumbers: [' MP-100 ', 'MP-100', 'HT-9'],
      theme: 'teal',
    })
    expect(parsed).toEqual({
      legalName: 'Northwind HVAC LLC',
      displayName: 'Northwind HVAC',
      phone: '+1 (212) 555-0100',
      email: 'office@northwind.example',
      address: '1 Main St\nNew York, NY',
      licenseNumbers: ['MP-100', 'HT-9'],
      theme: 'teal',
    })
  })

  it('rejects incomplete or unknown branding choices', () => {
    const parsed = companySettingsInputSchema.safeParse({
      legalName: '',
      displayName: '   ',
      phone: '123',
      email: 'not-an-email',
      address: '',
      licenseNumbers: Array.from({ length: 13 }, (_, index) => `L-${index}`),
      theme: 'purple',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(settingsFieldErrors(parsed.error)).toMatchObject({
        displayName: 'Enter the name customers should see.',
        phone: 'Enter a phone number with at least 7 digits.',
        email: 'Enter a valid email address.',
        licenseNumbers: 'Enter at most 12 license numbers.',
        theme: 'Choose a standard color theme.',
      })
    }
  })

  it('reads the seeded company and branding shape', () => {
    expect(parseCompanySetting({
      legalName: null,
      displayName: 'Servora HVAC',
      phone: null,
      email: null,
      address: null,
      licenseNumbers: [],
    })).toEqual(defaultCompany())
    expect(parseBrandingSetting({ theme: 'blue', logoAttachmentId: null })).toEqual({
      theme: 'blue',
      logoAttachmentId: null,
    })
    expect(parseBrandingSetting({ theme: 'nope', logoAttachmentId: 'not-an-id' }).theme).toBe('blue')
    expect(parseCompanySetting(null).displayName).toBe('Servora HVAC')
  })

  it('builds the shared footer from the details that were entered', () => {
    expect(companyDetailLines({
      ...defaultCompany(),
      legalName: 'Servora HVAC',
      phone: '2125550100',
    })).toEqual(['2125550100'])
    expect(companyDetailLines({
      legalName: 'Northwind HVAC LLC',
      displayName: 'Northwind HVAC',
      phone: '2125550100',
      email: 'office@northwind.example',
      address: '1 Main St\nNew York, NY',
      licenseNumbers: ['MP-100'],
    })).toEqual([
      'Northwind HVAC LLC',
      '1 Main St',
      'New York, NY',
      '2125550100 · office@northwind.example',
      'MP-100',
    ])
  })

  it('splits license lines and ignores blanks', () => {
    expect(licensesFromText(' MP-1 \n\nMP-1\nHT-9 ')).toEqual(['MP-1', 'HT-9'])
  })
})

describe('logo files', () => {
  it('accepts png, jpeg, and webp and rejects other bytes', () => {
    expect(inspectLogo({ bytes: PNG, fileName: '../logo.PNG' })).toMatchObject({
      ok: true,
      contentType: 'image/png',
      fileName: 'logo.png',
    })
    expect(inspectLogo({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), fileName: 'shot.jpeg' })).toMatchObject({
      ok: true,
      contentType: 'image/jpeg',
      fileName: 'shot.jpg',
    })
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ])
    expect(inspectLogo({ bytes: webp }).ok).toBe(true)
    expect(inspectLogo({ bytes: Uint8Array.from([0x3c, 0x73, 0x76, 0x67]) })).toMatchObject({
      ok: false,
      statusCode: 400,
    })
    expect(inspectLogo({ bytes: new Uint8Array(LOGO_MAX_BYTES + 1) })).toMatchObject({
      ok: false,
      statusCode: 413,
    })
    expect(inspectLogo({ bytes: new Uint8Array() })).toMatchObject({ ok: false, statusCode: 400 })
  })

  it('stores a logo under the upload root and refuses a key that leaves it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hvac-uploads-'))
    const key = 'logos/0192f000-0000-7000-8000-0000000000aa'
    try {
      expect(() => storedFilePath('../secrets', root)).toThrow('Invalid storage key')
      expect(() => storedFilePath('logos/not-a-uuid', root)).toThrow('Invalid storage key')
      const full = storedFilePath(key, root)
      const rel = relative(resolve(root), full)
      expect(rel.startsWith('..')).toBe(false)
      await writeStoredFile(key, PNG, root)
      expect(await readStoredFile(key, root)).toEqual(PNG)
      await deleteStoredFile(key, root)
      expect(await readStoredFile(key, root)).toBeNull()
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
