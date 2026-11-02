import { UButton, UContainer, UFormField, UInput, UTextarea } from '#components'
import {
  brandThemeChoices,
  companyDetailLines,
  companySettingsInputSchema,
  licensesFromText,
  LOGO_MAX_BYTES,
  SETTINGS_FIELDS,
  settingsFieldErrors,
  type BrandThemeId,
  type SettingsFieldErrors,
} from '../../../shared/utils/branding'
import { hasPermission, isRole } from '../../../shared/utils/rbac'
import CompanyMark from '../../components/company-mark'
import { applyBrandTheme, useBranding } from '../../composables/branding'
import { apiFetch } from '../../utils/api'

definePageMeta({
  middleware: 'auth',
})

export default defineComponent({
  name: 'CompanySettingsPage',
  async setup() {
    const branding = useBranding()
    const session = useUserSession()
    useSeoMeta({
      title: computed(() => `Company settings · ${branding.value.company.displayName}`),
    })

    if (!session.ready.value) await session.fetch()
    if (!session.loggedIn.value) {
      await navigateTo({ path: '/login', query: { redirect: '/settings' } })
      return () => null
    }

    const legalName = ref(branding.value.company.legalName ?? '')
    const displayName = ref(branding.value.company.displayName)
    const phone = ref(branding.value.company.phone ?? '')
    const email = ref(branding.value.company.email ?? '')
    const address = ref(branding.value.company.address ?? '')
    const licenses = ref(branding.value.company.licenseNumbers.join('\n'))
    const theme = ref<BrandThemeId>(branding.value.theme)
    const errors = ref<SettingsFieldErrors>({})
    const formError = ref('')
    const formStatus = ref<'idle' | 'saving' | 'saved'>('idle')
    const logoError = ref('')
    const logoStatus = ref<'idle' | 'saving' | 'saved'>('idle')
    const logoMessage = ref('')
    const savedSnapshot = ref(currentSnapshot())

    const dirty = computed(() => currentSnapshot() !== savedSnapshot.value)
    const themes = brandThemeChoices()

    function currentSnapshot(): string {
      return JSON.stringify({
        legalName: legalName.value,
        displayName: displayName.value,
        phone: phone.value,
        email: email.value,
        address: address.value,
        licenses: licenses.value,
        theme: theme.value,
      })
    }

    function markEdited() {
      if (formStatus.value === 'saved') formStatus.value = 'idle'
    }

    function fillFromBranding() {
      legalName.value = branding.value.company.legalName ?? ''
      displayName.value = branding.value.company.displayName
      phone.value = branding.value.company.phone ?? ''
      email.value = branding.value.company.email ?? ''
      address.value = branding.value.company.address ?? ''
      licenses.value = branding.value.company.licenseNumbers.join('\n')
      theme.value = branding.value.theme
      savedSnapshot.value = currentSnapshot()
    }

    function discard() {
      fillFromBranding()
      errors.value = {}
      formError.value = ''
      formStatus.value = 'idle'
    }

    async function save(event: Event) {
      event.preventDefault()
      if (formStatus.value === 'saving') return
      formError.value = ''
      errors.value = {}
      const parsed = companySettingsInputSchema.safeParse({
        legalName: legalName.value,
        displayName: displayName.value,
        phone: phone.value,
        email: email.value,
        address: address.value,
        licenseNumbers: licensesFromText(licenses.value),
        theme: theme.value,
      })
      if (!parsed.success) {
        errors.value = settingsFieldErrors(parsed.error)
        formError.value = 'Check the company details and try again.'
        formStatus.value = 'idle'
        return
      }

      formStatus.value = 'saving'
      try {
        branding.value = await apiFetch('/api/settings/company', { method: 'PUT', body: parsed.data })
        applyBrandTheme(branding.value.theme)
        fillFromBranding()
        formStatus.value = 'saved'
      }
      catch (caught) {
        formStatus.value = 'idle'
        errors.value = errorFields(caught)
        formError.value = errorMessage(caught, 'Could not save company settings.')
      }
    }

    async function onLogo(event: Event) {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || logoStatus.value === 'saving') return
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      logoError.value = ''
      logoMessage.value = ''
      logoStatus.value = 'idle'
      if (file.size > LOGO_MAX_BYTES) {
        logoError.value = 'Logo must be 1 MB or smaller.'
        return
      }

      const body = new FormData()
      body.append('logo', file)
      logoStatus.value = 'saving'
      try {
        branding.value = await apiFetch('/api/settings/logo', { method: 'POST', body })
        logoMessage.value = 'Logo saved.'
        logoStatus.value = 'saved'
      }
      catch (caught) {
        logoStatus.value = 'idle'
        logoError.value = errorMessage(caught, 'Could not update the logo.')
      }
    }

    async function removeLogo() {
      if (logoStatus.value === 'saving' || !branding.value.logoUrl) return
      logoError.value = ''
      logoMessage.value = ''
      logoStatus.value = 'saving'
      try {
        branding.value = await apiFetch('/api/settings/logo', { method: 'DELETE' })
        logoMessage.value = 'Logo removed.'
        logoStatus.value = 'saved'
      }
      catch (caught) {
        logoStatus.value = 'idle'
        logoError.value = errorMessage(caught, 'Could not remove the logo.')
      }
    }

    return () => {
      const role = session.user.value?.role
      const allowed = Boolean(role && isRole(role) && hasPermission(role, 'settings.manage'))
      if (!allowed) {
        return (
          <UContainer class="py-10">
            <h1 class="text-2xl font-semibold text-highlighted">Company settings</h1>
            <p class="mt-3 text-sm text-error" role="alert">You do not have access to this.</p>
          </UContainer>
        )
      }

      const previewLines = companyDetailLines({
        legalName: legalName.value.trim() || null,
        displayName: displayName.value.trim() || branding.value.company.displayName,
        phone: phone.value.trim() || null,
        email: email.value.trim() || null,
        address: address.value.trim() || null,
        licenseNumbers: licensesFromText(licenses.value),
      })

      return (
        <UContainer class="py-8">
          <div class="mx-auto flex max-w-2xl flex-col gap-8">
            <div class="space-y-3">
              <h1 class="text-2xl font-semibold text-highlighted">Company settings</h1>
              <p class="text-sm text-muted">
                The name, logo, and color theme are used across the app. The address, phone, email, and license numbers appear in the footer and on invoices.
              </p>
              <CompanyMark name={displayName.value.trim()} />
              {previewLines.length
                ? (
                    <div class="text-sm text-muted space-y-1" data-testid="settings-preview">
                      {previewLines.map((line, index) => <p key={`${index}:${line}`}>{line}</p>)}
                    </div>
                  )
                : null}
            </div>

            <section class="space-y-4">
              <h2 class="text-lg font-semibold text-highlighted">Logo</h2>
              <label class="flex flex-col gap-2 text-sm">
                Image file
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm"
                  data-testid="logo-input"
                  disabled={logoStatus.value === 'saving'}
                  onChange={onLogo}
                />
              </label>
              <p class="text-sm text-muted">PNG, JPEG, or WebP. 1 MB maximum.</p>
              {branding.value.logoUrl
                ? (
                    <UButton
                      type="button"
                      color="neutral"
                      variant="ghost"
                      disabled={logoStatus.value === 'saving'}
                      onClick={removeLogo}
                    >
                      Remove logo
                    </UButton>
                  )
                : null}
              <p
                aria-live="polite"
                role={logoError.value ? 'alert' : undefined}
                class={logoError.value ? 'text-sm text-error' : 'text-sm text-muted'}
                data-testid="logo-status"
              >
                {logoStatus.value === 'saving' ? 'Saving logo…' : logoStatus.value === 'saved' ? logoMessage.value : logoError.value}
              </p>
            </section>

            <form class="space-y-4" data-testid="company-settings-form" onSubmit={save}>
              <h2 class="text-lg font-semibold text-highlighted">Company details</h2>
              <UFormField label="Display name" required error={errors.value.displayName} description="Shown in the header.">
                <UInput
                  modelValue={displayName.value}
                  required
                  autocomplete="organization"
                  onUpdate:modelValue={(value: string) => {
                    displayName.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UFormField label="Legal name" error={errors.value.legalName} description="Registered name shown on invoices.">
                <UInput
                  modelValue={legalName.value}
                  autocomplete="organization"
                  onUpdate:modelValue={(value: string) => {
                    legalName.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UFormField label="Phone" error={errors.value.phone}>
                <UInput
                  modelValue={phone.value}
                  type="tel"
                  autocomplete="tel"
                  onUpdate:modelValue={(value: string) => {
                    phone.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UFormField label="Email" error={errors.value.email}>
                <UInput
                  modelValue={email.value}
                  type="email"
                  autocomplete="email"
                  onUpdate:modelValue={(value: string) => {
                    email.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UFormField label="Address" error={errors.value.address}>
                <UTextarea
                  modelValue={address.value}
                  rows={4}
                  autocomplete="street-address"
                  onUpdate:modelValue={(value: string) => {
                    address.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UFormField label="License numbers" error={errors.value.licenseNumbers} description="One number per line.">
                <UTextarea
                  modelValue={licenses.value}
                  rows={3}
                  onUpdate:modelValue={(value: string) => {
                    licenses.value = value
                    markEdited()
                  }}
                />
              </UFormField>

              <fieldset class="space-y-2">
                <legend class="text-sm font-medium">Color theme</legend>
                <p class="text-sm text-muted">Choose one of the standard themes. It is applied across the app after you save.</p>
                <div role="radiogroup" aria-label="Color theme" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {themes.map(choice => (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={theme.value === choice.id}
                      data-testid={`theme-${choice.id}`}
                      class={theme.value === choice.id
                        ? 'flex items-center gap-2 rounded-md bg-elevated px-3 py-2 text-sm ring-2 ring-highlighted'
                        : 'flex items-center gap-2 rounded-md px-3 py-2 text-sm ring-1 ring-default'}
                      onClick={() => {
                        theme.value = choice.id
                        markEdited()
                      }}
                    >
                      <span class="size-4 shrink-0 rounded-full" style={{ backgroundColor: choice.swatch }} />
                      {choice.label}
                    </button>
                  ))}
                </div>
                {errors.value.theme ? <p class="text-sm text-error">{errors.value.theme}</p> : null}
              </fieldset>

              <p aria-live="polite" role={formError.value ? 'alert' : undefined} class="text-sm" data-testid="settings-status">
                <span class={formError.value ? 'text-error' : 'text-muted'}>
                  {formStatus.value === 'saving' ? 'Saving…' : formStatus.value === 'saved' ? 'Saved.' : formError.value}
                </span>
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton type="submit" loading={formStatus.value === 'saving'}>
                  Save company settings
                </UButton>
                {dirty.value
                  ? (
                      <UButton type="button" color="neutral" variant="ghost" disabled={formStatus.value === 'saving'} onClick={discard}>
                        Discard changes
                      </UButton>
                    )
                  : null}
              </div>
            </form>
          </div>
        </UContainer>
      )
    }
  },
})

function errorBody(caught: unknown): Record<string, unknown> | undefined {
  if (!isRecord(caught) || !isRecord(caught.data)) return undefined
  return caught.data
}

function errorMessage(caught: unknown, fallback: string): string {
  const body = errorBody(caught)
  const message = body?.statusMessage ?? body?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function errorFields(caught: unknown): SettingsFieldErrors {
  const body = errorBody(caught)
  const payload = body && isRecord(body.data) ? body.data : body
  const fields = payload && isRecord(payload.fields) ? payload.fields : undefined
  if (!fields) return {}
  const result: SettingsFieldErrors = {}
  for (const key of SETTINGS_FIELDS) {
    const message = fields[key]
    if (typeof message === 'string' && message) result[key] = message
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
