import { NuxtLink, UButton, UCheckbox, UContainer, UFormField, UInput, URadioGroup, UTextarea } from '#components'
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  SERVICE_STATE_LABELS,
  SERVICE_STATES,
  customerCreateSchema,
  formFieldErrors,
  type CustomerDetail,
  type CustomerType,
  type FieldErrors,
  type ServiceState,
} from '../../../shared/utils/customers'
import { hasPermission, isRole } from '../../../shared/utils/rbac'
import { useBranding } from '../../composables/branding'
import { checkboxHint, fieldHint } from '../../components/field-hint'
import { apiErrorFields, apiErrorMessage, apiFetch } from '../../utils/api'

const sectionCard = 'space-y-5 rounded-xl border border-default bg-default p-5'
const typeChoices = CUSTOMER_TYPES.map(choice => ({ label: CUSTOMER_TYPE_LABELS[choice], value: choice }))
const stateChoices = SERVICE_STATES.map(choice => ({ label: SERVICE_STATE_LABELS[choice], value: choice }))

definePageMeta({
  middleware: 'auth',
})

export default defineComponent({
  name: 'NewCustomerPage',
  async setup() {
    const branding = useBranding()
    const session = useUserSession()
    useSeoMeta({
      title: computed(() => `New customer · ${branding.value.company.displayName}`),
    })

    if (!session.ready.value) await session.fetch()
    const allowed = Boolean(session.user.value?.role && isRole(session.user.value.role) && hasPermission(session.user.value.role, 'customers.manage'))

    const name = ref('')
    const type = ref<CustomerType | ''>('')
    const notes = ref('')
    const isContract = ref(false)

    const contactName = ref('')
    const contactTitle = ref('')
    const contactEmail = ref('')
    const contactPhone = ref('')
    const contactNotes = ref('')

    const propertyName = ref('')
    const addressLine1 = ref('')
    const addressLine2 = ref('')
    const city = ref('')
    const state = ref<ServiceState | ''>('')
    const postalCode = ref('')
    const taxJurisdiction = ref('')
    const taxExempt = ref(false)
    const accessNotes = ref('')

    const errors = ref<FieldErrors>({})
    const formError = ref('')
    const status = ref<'idle' | 'saving'>('idle')

    function markEdited() {
      if (formError.value) formError.value = ''
    }

    async function save(event: Event) {
      event.preventDefault()
      if (status.value === 'saving') return
      formError.value = ''
      errors.value = {}

      const body: Record<string, unknown> = {
        name: name.value,
        type: type.value,
        notes: notes.value,
        isContract: isContract.value,
      }
      if (contactStarted()) {
        body.contact = {
          name: contactName.value,
          title: contactTitle.value,
          email: contactEmail.value,
          phone: contactPhone.value,
          notes: contactNotes.value,
        }
      }
      if (propertyStarted()) {
        body.property = {
          name: propertyName.value,
          addressLine1: addressLine1.value,
          addressLine2: addressLine2.value,
          city: city.value,
          state: state.value,
          postalCode: postalCode.value,
          taxJurisdiction: taxJurisdiction.value,
          taxExempt: taxExempt.value,
          accessNotes: accessNotes.value,
        }
      }

      const parsed = customerCreateSchema.safeParse(body)
      if (!parsed.success) {
        errors.value = formFieldErrors(parsed.error)
        formError.value = 'Check the customer details and try again.'
        return
      }

      status.value = 'saving'
      try {
        const created = await apiFetch<CustomerDetail>('/api/customers', { method: 'POST', body: parsed.data })
        await navigateTo(`/customers/${created.id}?created=1`)
      }
      catch (caught) {
        status.value = 'idle'
        errors.value = apiErrorFields(caught)
        formError.value = apiErrorMessage(caught, 'Could not save this customer.')
      }
    }

    function contactStarted(): boolean {
      return [contactName.value, contactTitle.value, contactEmail.value, contactPhone.value, contactNotes.value]
        .some(value => value.trim().length > 0)
    }

    function propertyStarted(): boolean {
      return Boolean(
        propertyName.value.trim()
        || addressLine1.value.trim()
        || addressLine2.value.trim()
        || city.value.trim()
        || state.value
        || postalCode.value.trim()
        || taxJurisdiction.value.trim()
        || accessNotes.value.trim()
        || taxExempt.value,
      )
    }

    return () => {
      if (!allowed) {
        return (
          <UContainer class="py-10">
            <h1 class="text-2xl font-semibold text-highlighted">New customer</h1>
            <p class="mt-3 text-sm text-error" role="alert">You do not have access to this.</p>
          </UContainer>
        )
      }

      const saving = status.value === 'saving'
      return (
        <UContainer class="py-8">
          <form class="mx-auto flex max-w-5xl flex-col gap-6" data-testid="customer-create-form" onSubmit={save}>
            <div class="space-y-2">
              <NuxtLink to="/customers" class="text-sm text-muted">Customers</NuxtLink>
              <h1 class="text-2xl font-semibold tracking-tight text-highlighted">New customer</h1>
              <p class="max-w-2xl text-sm text-muted">
                Add the billing contact and the first property when you have them. Each property keeps its own New York or New Jersey tax context.
              </p>
            </div>

            <section class={sectionCard}>
              <h2 class="text-base font-semibold text-highlighted">Customer</h2>
              <UFormField class="w-full" label="Name" required error={errors.value.name}>
                <UInput
                  class="w-full"
                  modelValue={name.value}
                  required
                  autocomplete="organization"
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    name.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <URadioGroup
                legend="Type"
                orientation="horizontal"
                items={typeChoices}
                modelValue={type.value || undefined}
                disabled={saving}
                onUpdate:modelValue={(value: CustomerType) => {
                  type.value = value
                  markEdited()
                }}
              />
              {errors.value.type ? <p class="text-sm text-error">{errors.value.type}</p> : null}
              <UCheckbox
                v-slots={checkboxHint('Contract customer', 'Can be exempt from the service-call charge once that rule is set.')}
                modelValue={isContract.value}
                disabled={saving}
                onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                  if (typeof value !== 'boolean') return
                  isContract.value = value
                  markEdited()
                }}
              />
              <UFormField class="w-full" label="Notes" error={errors.value.notes}>
                <UTextarea
                  class="w-full"
                  modelValue={notes.value}
                  rows={3}
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    notes.value = value
                    markEdited()
                  }}
                />
              </UFormField>
            </section>

            <section class={sectionCard}>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">Billing contact</h2>
                <p class="text-sm text-muted">
                  Invoices go to this person unless a property names someone else. Leave the section blank to add contacts later.
                </p>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField class="w-full" label="Name" error={errors.value['contact.name']}>
                  <UInput
                    class="w-full"
                    modelValue={contactName.value}
                    autocomplete="name"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      contactName.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="Title" error={errors.value['contact.title']}>
                  <UInput
                    class="w-full"
                    modelValue={contactTitle.value}
                    autocomplete="organization-title"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      contactTitle.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="Email" error={errors.value['contact.email']}>
                  <UInput
                    class="w-full"
                    modelValue={contactEmail.value}
                    type="email"
                    autocomplete="email"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      contactEmail.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="Phone" error={errors.value['contact.phone']}>
                  <UInput
                    class="w-full"
                    modelValue={contactPhone.value}
                    type="tel"
                    autocomplete="tel"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      contactPhone.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
              </div>
              <UFormField class="w-full" label="Contact notes" error={errors.value['contact.notes']}>
                <UTextarea
                  class="w-full"
                  modelValue={contactNotes.value}
                  rows={2}
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    contactNotes.value = value
                    markEdited()
                  }}
                />
              </UFormField>
            </section>

            <section class={sectionCard}>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">First property</h2>
                <p class="text-sm text-muted">
                  The state and jurisdiction are the tax context for work at this address. The billing contact above is also the site contact until you change it.
                </p>
              </div>
              <UFormField class="w-full" error={errors.value['property.name']} v-slots={fieldHint('Property name', 'Optional. For example, Hudson Plaza — Manhattan.')}>
                <UInput
                  class="w-full"
                  modelValue={propertyName.value}
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    propertyName.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField class="w-full" label="Street address" error={errors.value['property.addressLine1']}>
                  <UInput
                    class="w-full"
                    modelValue={addressLine1.value}
                    autocomplete="address-line1"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      addressLine1.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="Address line 2" error={errors.value['property.addressLine2']}>
                  <UInput
                    class="w-full"
                    modelValue={addressLine2.value}
                    autocomplete="address-line2"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      addressLine2.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="City" error={errors.value['property.city']}>
                  <UInput
                    class="w-full"
                    modelValue={city.value}
                    autocomplete="address-level2"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      city.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" label="ZIP code" error={errors.value['property.postalCode']}>
                  <UInput
                    class="w-full"
                    modelValue={postalCode.value}
                    autocomplete="postal-code"
                    disabled={saving}
                    onUpdate:modelValue={(value: string) => {
                      postalCode.value = value
                      markEdited()
                    }}
                  />
                </UFormField>
              </div>
              <URadioGroup
                legend="State"
                orientation="horizontal"
                items={stateChoices}
                modelValue={state.value || undefined}
                disabled={saving}
                onUpdate:modelValue={(value: ServiceState) => {
                  state.value = value
                  markEdited()
                }}
              />
              {errors.value['property.state'] ? <p class="text-sm text-error">{errors.value['property.state']}</p> : null}
              <UFormField class="w-full" error={errors.value['property.taxJurisdiction']} v-slots={fieldHint('Tax jurisdiction', 'County or city, once the accountant confirms the rule.')}>
                <UInput
                  class="w-full"
                  modelValue={taxJurisdiction.value}
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    taxJurisdiction.value = value
                    markEdited()
                  }}
                />
              </UFormField>
              <UCheckbox
                label="Tax exempt"
                modelValue={taxExempt.value}
                disabled={saving}
                onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                  if (typeof value !== 'boolean') return
                  taxExempt.value = value
                  markEdited()
                }}
              />
              <UFormField class="w-full" label="Access notes" error={errors.value['property.accessNotes']}>
                <UTextarea
                  class="w-full"
                  modelValue={accessNotes.value}
                  rows={3}
                  disabled={saving}
                  onUpdate:modelValue={(value: string) => {
                    accessNotes.value = value
                    markEdited()
                  }}
                />
              </UFormField>
            </section>

            <div class="flex flex-wrap items-center gap-3">
              <UButton type="submit" loading={saving}>Save customer</UButton>
              <UButton to="/customers" color="neutral" variant="ghost" disabled={saving}>Cancel</UButton>
              <p aria-live="polite" role={formError.value ? 'alert' : undefined} class="text-sm" data-testid="customer-create-status">
                <span class={formError.value ? 'text-error' : 'text-muted'}>
                  {saving ? 'Saving…' : formError.value}
                </span>
              </p>
            </div>
          </form>
        </UContainer>
      )
    }
  },
})
