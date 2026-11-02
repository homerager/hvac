import { NuxtLink, UButton, UContainer, UFormField, UInput, UTextarea } from '#components'
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
import { fieldHint } from '../../components/field-hint'
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
    const logoInput = ref<HTMLInputElement | null>(null)

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

      const previewName = displayName.value.trim() || branding.value.company.displayName
      const previewLines = companyDetailLines({
        legalName: legalName.value.trim() || null,
        displayName: previewName,
        phone: phone.value.trim() || null,
        email: email.value.trim() || null,
        address: address.value.trim() || null,
        licenseNumbers: licensesFromText(licenses.value),
      })
      const selectedTheme = themes.find(choice => choice.id === theme.value) ?? themes[0]
      const logoBusy = logoStatus.value === 'saving'
      const logoStatusText = logoStatus.value === 'saving'
        ? 'Saving logo…'
        : logoStatus.value === 'saved'
          ? logoMessage.value
          : logoError.value

      return (
        <UContainer class="py-8">
          <div class="mx-auto grid max-w-5xl items-start gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div class="space-y-6">
              <div class="space-y-2">
                <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Company settings</h1>
                <p class="max-w-2xl text-sm text-muted">
                  The name, logo, and color theme are used across the app. The address, phone, email, and license numbers appear in the footer and on invoices.
                </p>
                <NuxtLink to="/settings/decisions" class="text-sm underline" data-testid="decisions-link">
                  Client decisions and requirements sign-off
                </NuxtLink>
              </div>

              <section class="space-y-4 rounded-xl border border-default bg-default p-5">
                <div class="space-y-1">
                  <h2 class="text-base font-semibold text-highlighted">Logo</h2>
                  <p class="text-sm text-muted">PNG, JPEG, or WebP. 1 MB maximum.</p>
                </div>
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div class="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-default bg-elevated px-4 sm:w-44">
                    {branding.value.logoUrl
                      ? <img src={branding.value.logoUrl} alt="" class="max-h-16 max-w-full object-contain" />
                      : <span class="text-sm text-muted">No logo</span>}
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <input
                      ref={logoInput}
                      id="company-logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Image file"
                      class="sr-only"
                      data-testid="logo-input"
                      disabled={logoBusy}
                      onChange={onLogo}
                    />
                    <UButton type="button" color="neutral" variant="outline" disabled={logoBusy} onClick={() => logoInput.value?.click()}>
                      {branding.value.logoUrl ? 'Replace logo' : 'Upload logo'}
                    </UButton>
                    {branding.value.logoUrl
                      ? (
                          <UButton type="button" color="neutral" variant="ghost" disabled={logoBusy} onClick={removeLogo}>
                            Remove logo
                          </UButton>
                        )
                      : null}
                  </div>
                </div>
                {logoStatusText
                  ? (
                      <p
                        aria-live="polite"
                        role={logoError.value ? 'alert' : undefined}
                        class={logoError.value ? 'text-sm text-error' : 'text-sm text-muted'}
                        data-testid="logo-status"
                      >
                        {logoStatusText}
                      </p>
                    )
                  : null}
              </section>

              <form class="space-y-6 rounded-xl border border-default bg-default p-5" data-testid="company-settings-form" onSubmit={save}>
                <h2 class="text-base font-semibold text-highlighted">Company details</h2>
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField class="w-full" error={errors.value.displayName} v-slots={fieldHint('Display name', 'Shown in the header.', true)}>
                    <UInput
                      class="w-full"
                      modelValue={displayName.value}
                      required
                      autocomplete="organization"
                      onUpdate:modelValue={(value: string) => {
                        displayName.value = value
                        markEdited()
                      }}
                    />
                  </UFormField>
                  <UFormField class="w-full" error={errors.value.legalName} v-slots={fieldHint('Legal name', 'Registered name shown on invoices.')}>
                    <UInput
                      class="w-full"
                      modelValue={legalName.value}
                      autocomplete="organization"
                      onUpdate:modelValue={(value: string) => {
                        legalName.value = value
                        markEdited()
                      }}
                    />
                  </UFormField>
                  <UFormField class="w-full" label="Phone" error={errors.value.phone}>
                    <UInput
                      class="w-full"
                      modelValue={phone.value}
                      type="tel"
                      autocomplete="tel"
                      onUpdate:modelValue={(value: string) => {
                        phone.value = value
                        markEdited()
                      }}
                    />
                  </UFormField>
                  <UFormField class="w-full" label="Email" error={errors.value.email}>
                    <UInput
                      class="w-full"
                      modelValue={email.value}
                      type="email"
                      autocomplete="email"
                      onUpdate:modelValue={(value: string) => {
                        email.value = value
                        markEdited()
                      }}
                    />
                  </UFormField>
                </div>
                <UFormField class="w-full" label="Address" error={errors.value.address}>
                  <UTextarea
                    class="w-full"
                    modelValue={address.value}
                    rows={3}
                    autocomplete="street-address"
                    onUpdate:modelValue={(value: string) => {
                      address.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" error={errors.value.licenseNumbers} v-slots={fieldHint('License numbers', 'One number per line.')}>
                  <UTextarea
                    class="w-full"
                    modelValue={licenses.value}
                    rows={3}
                    onUpdate:modelValue={(value: string) => {
                      licenses.value = value
                      markEdited()
                    }}
                  />
                </UFormField>

                <fieldset class="space-y-3">
                  <legend class="text-base font-semibold text-highlighted">Color theme</legend>
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
                          ? 'flex items-center gap-3 rounded-lg border border-primary bg-primary/10 px-3 py-2.5 text-left text-sm font-medium ring-2 ring-primary'
                          : 'flex items-center gap-3 rounded-lg border border-default px-3 py-2.5 text-left text-sm hover:bg-elevated'}
                        onClick={() => {
                          theme.value = choice.id
                          markEdited()
                        }}
                      >
                        <span class="size-8 shrink-0 rounded-md" style={{ backgroundColor: choice.swatch }} />
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  {errors.value.theme ? <p class="text-sm text-error">{errors.value.theme}</p> : null}
                </fieldset>

                <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
                  <UButton type="submit" loading={formStatus.value === 'saving'}>
                    Save changes
                  </UButton>
                  {dirty.value
                    ? (
                        <UButton type="button" color="neutral" variant="ghost" disabled={formStatus.value === 'saving'} onClick={discard}>
                          Discard changes
                        </UButton>
                      )
                    : null}
                  <p aria-live="polite" role={formError.value ? 'alert' : undefined} class="text-sm" data-testid="settings-status">
                    <span class={formError.value ? 'text-error' : 'text-muted'}>
                      {formStatus.value === 'saving' ? 'Saving…' : formStatus.value === 'saved' ? 'Saved.' : formError.value}
                    </span>
                  </p>
                </div>
              </form>
            </div>

            <aside class="md:sticky md:top-6">
              <div class="overflow-hidden rounded-xl border border-default bg-default" data-testid="settings-preview">
                <div class="border-b border-default bg-elevated px-4 py-3">
                  <CompanyMark name={previewName} />
                </div>
                <div class="space-y-3 px-4 py-4">
                  <span class="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-white" style={{ backgroundColor: selectedTheme?.swatch }}>
                    {selectedTheme?.label}
                  </span>
                  <p class="text-xs text-muted">Applied across the app after you save.</p>
                </div>
                {previewLines.length
                  ? (
                      <div class="space-y-1 border-t border-default px-4 py-3 text-sm text-muted">
                        {previewLines.map((line, index) => <p key={`${index}:${line}`}>{line}</p>)}
                      </div>
                    )
                  : null}
              </div>
            </aside>
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
