import { z } from 'zod'
import { normalizeEmail } from './email'

// Installation branding (BR-16). The company name, logo, and color are settings.
// `blue` is the default theme; its Nuxt UI primary is `sky`, matching app.config
// until a saved theme is applied.

export const BRAND_THEMES = {
  blue: { label: 'Blue', primary: 'sky', swatch: '#0369a1' },
  navy: { label: 'Navy', primary: 'blue', swatch: '#1d4ed8' },
  teal: { label: 'Teal', primary: 'teal', swatch: '#0f766e' },
  green: { label: 'Green', primary: 'emerald', swatch: '#047857' },
  indigo: { label: 'Indigo', primary: 'indigo', swatch: '#4338ca' },
  slate: { label: 'Slate', primary: 'slate', swatch: '#334155' },
} as const

export const BRAND_THEME_IDS = ['blue', 'navy', 'teal', 'green', 'indigo', 'slate'] as const satisfies readonly (keyof typeof BRAND_THEMES)[]

export type BrandThemeId = (typeof BRAND_THEME_IDS)[number]

export type BrandPrimary = (typeof BRAND_THEMES)[BrandThemeId]['primary']

export const DEFAULT_DISPLAY_NAME = 'Servora HVAC'

export const LOGO_MAX_BYTES = 1_000_000

export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number]

const LOGO_EXTENSION: Record<LogoContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export type CompanySetting = {
  legalName: string | null
  displayName: string
  phone: string | null
  email: string | null
  address: string | null
  licenseNumbers: string[]
}

export type BrandingSetting = {
  theme: BrandThemeId
  logoAttachmentId: string | null
}

export type PublicBranding = {
  company: CompanySetting
  theme: BrandThemeId
  logoUrl: string | null
}

export const SETTINGS_FIELDS = ['legalName', 'displayName', 'phone', 'email', 'address', 'licenseNumbers', 'theme'] as const

export type SettingsField = (typeof SETTINGS_FIELDS)[number]

export type SettingsFieldErrors = Partial<Record<SettingsField, string>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function defaultCompany(): CompanySetting {
  return {
    legalName: null,
    displayName: DEFAULT_DISPLAY_NAME,
    phone: null,
    email: null,
    address: null,
    licenseNumbers: [],
  }
}

export function defaultBranding(): BrandingSetting {
  return { theme: 'blue', logoAttachmentId: null }
}

export function defaultPublicBranding(): PublicBranding {
  return { company: defaultCompany(), theme: 'blue', logoUrl: null }
}

export function primaryColorForTheme(theme: BrandThemeId): BrandPrimary {
  return BRAND_THEMES[theme].primary
}

export function brandThemeChoices(): Array<{ id: BrandThemeId, label: string, swatch: string }> {
  return BRAND_THEME_IDS.map(id => ({ id, label: BRAND_THEMES[id].label, swatch: BRAND_THEMES[id].swatch }))
}

/** Lines for the shared footer. The header already shows the display name. */
export function companyDetailLines(company: CompanySetting): string[] {
  const lines: string[] = []
  if (company.legalName && company.legalName !== company.displayName) lines.push(company.legalName)
  if (company.address) {
    for (const line of company.address.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) lines.push(trimmed)
    }
  }
  const contact = [company.phone, company.email].filter((part): part is string => Boolean(part)).join(' · ')
  if (contact) lines.push(contact)
  if (company.licenseNumbers.length > 0) lines.push(company.licenseNumbers.join(' · '))
  return lines
}

export function licensesFromText(text: string): string[] {
  return uniqueStrings(text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0))
}

export function parseCompanySetting(value: unknown): CompanySetting {
  const record = isRecord(value) ? value : {}
  const displayName = singleLine(typeof record.displayName === 'string' ? record.displayName : '')
  const licenses = Array.isArray(record.licenseNumbers)
    ? uniqueStrings(record.licenseNumbers.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(item => item.length > 0)).slice(0, 50)
    : []
  return {
    legalName: optionalStoredText(record.legalName, 500),
    displayName: displayName || DEFAULT_DISPLAY_NAME,
    phone: optionalStoredText(record.phone, 80),
    email: optionalStoredText(record.email, 320),
    address: optionalStoredText(record.address, 2000),
    licenseNumbers: licenses,
  }
}

export function parseBrandingSetting(value: unknown): BrandingSetting {
  const record = isRecord(value) ? value : {}
  const theme = brandThemeSchema.safeParse(record.theme)
  const logoId = record.logoAttachmentId
  return {
    theme: theme.success ? theme.data : 'blue',
    logoAttachmentId: typeof logoId === 'string' && UUID.test(logoId) ? logoId : null,
  }
}

export function settingsFieldErrors(error: z.ZodError): SettingsFieldErrors {
  const fields: SettingsFieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (!isSettingsField(key) || fields[key]) continue
    fields[key] = issue.message
  }
  return fields
}

export type LogoInspection
  = { ok: true, contentType: LogoContentType, fileName: string }
    | { ok: false, statusCode: 400 | 413, message: string }

/** Sniffs the bytes. The browser-supplied MIME type is not trusted. */
export function inspectLogo(input: { bytes: Uint8Array, fileName?: string }): LogoInspection {
  const bytes = input.bytes
  if (bytes.byteLength === 0) {
    return { ok: false, statusCode: 400, message: 'Choose a PNG, JPEG, or WebP logo.' }
  }
  if (bytes.byteLength > LOGO_MAX_BYTES) {
    return { ok: false, statusCode: 413, message: 'Logo must be 1 MB or smaller.' }
  }
  const contentType = sniffLogo(bytes)
  if (!contentType) {
    return { ok: false, statusCode: 400, message: 'Choose a PNG, JPEG, or WebP logo.' }
  }
  return { ok: true, contentType, fileName: logoFileName(input.fileName, contentType) }
}

const brandThemeSchema = z.enum(BRAND_THEME_IDS)

const optionalEmail = z.string().trim().max(254, { error: 'Email must be 254 characters or fewer.' }).transform((value) => {
  const normalized = normalizeEmail(value)
  return normalized.length === 0 ? null : normalized
}).pipe(z.union([z.email({ error: 'Enter a valid email address.' }), z.null()]))

const optionalPhone = z.string().trim().max(40, { error: 'Phone number must be 40 characters or fewer.' }).transform(value => value.length === 0 ? null : value).pipe(
  z.union([
    z.null(),
    z.string().refine(isCompanyPhone, { error: 'Enter a phone number with at least 7 digits.' }),
  ]),
)

export const companySettingsInputSchema = z.object({
  legalName: optionalLine(200, 'Legal name must be 200 characters or fewer.'),
  displayName: z.string().transform(singleLine).pipe(
    z.string().min(1, { error: 'Enter the name customers should see.' }).max(120, { error: 'Display name must be 120 characters or fewer.' }),
  ),
  phone: optionalPhone,
  email: optionalEmail,
  address: z.string().trim().max(500, { error: 'Address must be 500 characters or fewer.' }).transform(value => value.length === 0 ? null : value),
  licenseNumbers: z.array(
    z.string().trim().min(1, { error: 'Enter a license number or remove the blank line.' }).max(80, { error: 'Each license number must be 80 characters or fewer.' }),
  ).transform(uniqueStrings).pipe(z.array(z.string()).max(12, { error: 'Enter at most 12 license numbers.' })),
  theme: z.enum(BRAND_THEME_IDS, { error: 'Choose a standard color theme.' }),
})

export type CompanySettingsInput = z.infer<typeof companySettingsInputSchema>

function optionalLine(max: number, tooLong: string) {
  return z.string().transform(singleLine).pipe(
    z.string().max(max, { error: tooLong }),
  ).transform(value => value.length === 0 ? null : value)
}

function isCompanyPhone(value: string): boolean {
  if (!/^[0-9+().\-\s]+$/.test(value)) return false
  const digits = value.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }
  return unique
}

function optionalStoredText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function isSettingsField(value: unknown): value is SettingsField {
  return typeof value === 'string' && (SETTINGS_FIELDS as readonly string[]).includes(value)
}

function sniffLogo(bytes: Uint8Array): LogoContentType | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

function logoFileName(fileName: string | undefined, contentType: LogoContentType): string {
  const extension = LOGO_EXTENSION[contentType]
  const base = fileName?.replace(/\\/g, '/').split('/').pop() ?? ''
  const stem = base
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const safeStem = stem && stem !== '.' && stem !== '..' ? stem : 'logo'
  return `${safeStem}.${extension}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
