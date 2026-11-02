import { NuxtLink, UBadge, UButton, UCheckbox, UContainer, UFormField, UInput, URadioGroup, USelect, UTextarea } from '#components'
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  SERVICE_STATE_LABELS,
  SERVICE_STATES,
  contactInputSchema,
  contactRoles,
  customerUpdateSchema,
  formFieldErrors,
  formatPropertyAddress,
  invoiceRecipientLabel,
  propertyInputSchema,
  propertyTitle,
  taxContextLabel,
  type ContactRecord,
  type CustomerDetail,
  type CustomerType,
  type FieldErrors,
  type PropertyRecord,
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

type ContactDraft = {
  name: string
  title: string
  email: string
  phone: string
  notes: string
}

type PropertyDraft = {
  name: string
  addressLine1: string
  addressLine2: string
  city: string
  state: ServiceState | ''
  postalCode: string
  taxJurisdiction: string
  taxExempt: boolean
  accessNotes: string
  siteContactId: string
  billingContactId: string
}

export default defineComponent({
  name: 'CustomerDetailPage',
  async setup() {
    const route = useRoute()
    const branding = useBranding()
    const session = useUserSession()
    const id = computed(() => firstParam(route.params.id))
    const pageName = ref('Customer')

    useSeoMeta({
      title: computed(() => `${pageName.value} · ${branding.value.company.displayName}`),
    })

    if (!session.ready.value) await session.fetch()
    const allowed = Boolean(session.user.value?.role && isRole(session.user.value.role) && hasPermission(session.user.value.role, 'customers.manage'))

    const { data, error, status } = await useAsyncData(
      () => `customer:${id.value}`,
      () => apiFetch<CustomerDetail>(`/api/customers/${id.value}`),
      { watch: [id], immediate: allowed },
    )

    const name = ref('')
    const type = ref<CustomerType | ''>('')
    const notes = ref('')
    const isContract = ref(false)
    const billingContactId = ref('')
    const customerErrors = ref<FieldErrors>({})
    const customerStatus = ref<'idle' | 'saving' | 'saved'>('idle')
    const customerError = ref('')
    const notice = ref(route.query.created === '1' ? 'Customer saved.' : '')
    const filledFor = ref('')

    const contactOpen = ref(false)
    const editingContactId = ref<string | null>(null)
    const contactDraft = ref<ContactDraft>(emptyContact())
    const contactErrors = ref<FieldErrors>({})
    const contactStatus = ref<'idle' | 'saving' | 'saved'>('idle')
    const contactError = ref('')
    const contactNotice = ref('')
    const confirmingDeleteId = ref<string | null>(null)
    const deletingContactId = ref<string | null>(null)

    const propertyOpen = ref(false)
    const editingPropertyId = ref<string | null>(null)
    const propertyDraft = ref<PropertyDraft>(emptyProperty())
    const propertyErrors = ref<FieldErrors>({})
    const propertyStatus = ref<'idle' | 'saving' | 'saved'>('idle')
    const propertyError = ref('')
    const propertyNotice = ref('')
    const confirmingArchivePropertyId = ref<string | null>(null)
    const propertyActionId = ref<string | null>(null)
    const propertyActionError = ref('')

    const archiveConfirm = ref(false)
    const archiveStatus = ref<'idle' | 'saving'>('idle')
    const archiveError = ref('')
    const archiveNotice = ref('')

    watch(data, (next) => {
      if (!next) return
      pageName.value = next.name
      if (filledFor.value === next.id) return
      fillCustomer(next)
      filledFor.value = next.id
    }, { immediate: true })

    watch(id, () => {
      closeContact()
      closeProperty()
      customerStatus.value = 'idle'
      customerError.value = ''
      customerErrors.value = {}
      notice.value = route.query.created === '1' ? 'Customer saved.' : ''
      contactNotice.value = ''
      propertyNotice.value = ''
      archiveNotice.value = ''
      archiveError.value = ''
      archiveConfirm.value = false
    })

    function fillCustomer(next: CustomerDetail) {
      name.value = next.name
      type.value = next.type
      notes.value = next.notes ?? ''
      isContract.value = next.isContract
      billingContactId.value = next.billingContactId ?? ''
    }

    function markCustomerEdited() {
      notice.value = ''
      customerError.value = ''
      if (customerStatus.value === 'saved') customerStatus.value = 'idle'
    }

    function remember(next: CustomerDetail, syncForm: boolean) {
      data.value = next
      if (syncForm) fillCustomer(next)
    }

    async function saveCustomer(event: Event) {
      event.preventDefault()
      const current = data.value
      if (!current || customerStatus.value === 'saving') return
      customerError.value = ''
      customerErrors.value = {}
      const parsed = customerUpdateSchema.safeParse({
        name: name.value,
        type: type.value,
        notes: notes.value,
        isContract: isContract.value,
        billingContactId: billingContactId.value,
      })
      if (!parsed.success) {
        customerErrors.value = formFieldErrors(parsed.error)
        customerError.value = 'Check the customer details and try again.'
        customerStatus.value = 'idle'
        return
      }
      customerStatus.value = 'saving'
      try {
        const next = await apiFetch<CustomerDetail>(`/api/customers/${current.id}`, { method: 'PUT', body: parsed.data })
        remember(next, true)
        notice.value = ''
        customerStatus.value = 'saved'
      }
      catch (caught) {
        customerStatus.value = 'idle'
        customerErrors.value = apiErrorFields(caught)
        customerError.value = apiErrorMessage(caught, 'Could not save this customer.')
      }
    }

    function openNewContact() {
      editingContactId.value = null
      contactDraft.value = emptyContact()
      contactErrors.value = {}
      contactError.value = ''
      contactStatus.value = 'idle'
      contactNotice.value = ''
      confirmingDeleteId.value = null
      contactOpen.value = true
    }

    function openContact(contact: ContactRecord) {
      editingContactId.value = contact.id
      contactDraft.value = {
        name: contact.name,
        title: contact.title ?? '',
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        notes: contact.notes ?? '',
      }
      contactErrors.value = {}
      contactError.value = ''
      contactStatus.value = 'idle'
      contactNotice.value = ''
      confirmingDeleteId.value = null
      contactOpen.value = true
    }

    function closeContact() {
      contactOpen.value = false
      editingContactId.value = null
      contactDraft.value = emptyContact()
      contactErrors.value = {}
      contactError.value = ''
      contactStatus.value = 'idle'
      confirmingDeleteId.value = null
    }

    function patchContact(patch: Partial<ContactDraft>) {
      contactDraft.value = { ...contactDraft.value, ...patch }
      contactError.value = ''
      if (contactStatus.value === 'saved') contactStatus.value = 'idle'
    }

    async function saveContact(event: Event) {
      event.preventDefault()
      const current = data.value
      if (!current || contactStatus.value === 'saving') return
      contactError.value = ''
      contactErrors.value = {}
      const parsed = contactInputSchema.safeParse(contactDraft.value)
      if (!parsed.success) {
        contactErrors.value = formFieldErrors(parsed.error)
        contactError.value = 'Check the contact and try again.'
        return
      }
      const contactId = editingContactId.value
      contactStatus.value = 'saving'
      try {
        const next = contactId
          ? await apiFetch<CustomerDetail>(`/api/customers/${current.id}/contacts/${contactId}`, { method: 'PUT', body: parsed.data })
          : await apiFetch<CustomerDetail>(`/api/customers/${current.id}/contacts`, { method: 'POST', body: parsed.data })
        remember(next, false)
        closeContact()
        contactNotice.value = 'Contact saved.'
      }
      catch (caught) {
        contactStatus.value = 'idle'
        contactErrors.value = apiErrorFields(caught)
        contactError.value = apiErrorMessage(caught, 'Could not save this contact.')
      }
    }

    async function removeContact(contactId: string) {
      const current = data.value
      if (!current || deletingContactId.value) return
      deletingContactId.value = contactId
      contactNotice.value = ''
      try {
        const next = await apiFetch<CustomerDetail>(`/api/customers/${current.id}/contacts/${contactId}`, { method: 'DELETE' })
        remember(next, false)
        if (editingContactId.value === contactId) closeContact()
        confirmingDeleteId.value = null
        contactNotice.value = 'Contact removed.'
      }
      catch (caught) {
        contactNotice.value = ''
        contactError.value = apiErrorMessage(caught, 'Could not remove this contact.')
        confirmingDeleteId.value = contactId
      }
      finally {
        deletingContactId.value = null
      }
    }

    function openNewProperty() {
      editingPropertyId.value = null
      propertyDraft.value = emptyProperty()
      propertyErrors.value = {}
      propertyError.value = ''
      propertyStatus.value = 'idle'
      propertyNotice.value = ''
      propertyActionError.value = ''
      confirmingArchivePropertyId.value = null
      propertyOpen.value = true
    }

    function openProperty(property: PropertyRecord) {
      editingPropertyId.value = property.id
      propertyDraft.value = {
        name: property.name ?? '',
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2 ?? '',
        city: property.city,
        state: property.state,
        postalCode: property.postalCode,
        taxJurisdiction: property.taxJurisdiction ?? '',
        taxExempt: property.taxExempt,
        accessNotes: property.accessNotes ?? '',
        siteContactId: property.siteContactId ?? '',
        billingContactId: property.billingContactId ?? '',
      }
      propertyErrors.value = {}
      propertyError.value = ''
      propertyStatus.value = 'idle'
      propertyNotice.value = ''
      propertyActionError.value = ''
      confirmingArchivePropertyId.value = null
      propertyOpen.value = true
    }

    function closeProperty() {
      propertyOpen.value = false
      editingPropertyId.value = null
      propertyDraft.value = emptyProperty()
      propertyErrors.value = {}
      propertyError.value = ''
      propertyStatus.value = 'idle'
    }

    function patchProperty(patch: Partial<PropertyDraft>) {
      propertyDraft.value = { ...propertyDraft.value, ...patch }
      propertyError.value = ''
      if (propertyStatus.value === 'saved') propertyStatus.value = 'idle'
    }

    async function saveProperty(event: Event) {
      event.preventDefault()
      const current = data.value
      if (!current || propertyStatus.value === 'saving') return
      propertyError.value = ''
      propertyErrors.value = {}
      const parsed = propertyInputSchema.safeParse(propertyDraft.value)
      if (!parsed.success) {
        propertyErrors.value = formFieldErrors(parsed.error)
        propertyError.value = 'Check the property and try again.'
        return
      }
      const propertyId = editingPropertyId.value
      propertyStatus.value = 'saving'
      try {
        const next = propertyId
          ? await apiFetch<CustomerDetail>(`/api/customers/${current.id}/properties/${propertyId}`, { method: 'PUT', body: parsed.data })
          : await apiFetch<CustomerDetail>(`/api/customers/${current.id}/properties`, { method: 'POST', body: parsed.data })
        remember(next, false)
        closeProperty()
        propertyNotice.value = 'Property saved.'
      }
      catch (caught) {
        propertyStatus.value = 'idle'
        propertyErrors.value = apiErrorFields(caught)
        propertyError.value = apiErrorMessage(caught, 'Could not save this property.')
      }
    }

    async function setPropertyArchived(propertyId: string, archived: boolean) {
      const current = data.value
      if (!current || propertyActionId.value) return
      propertyActionId.value = propertyId
      propertyActionError.value = ''
      propertyNotice.value = ''
      try {
        const action = archived ? 'archive' : 'restore'
        const next = await apiFetch<CustomerDetail>(`/api/customers/${current.id}/properties/${propertyId}/${action}`, { method: 'POST' })
        remember(next, false)
        confirmingArchivePropertyId.value = null
        if (editingPropertyId.value === propertyId) closeProperty()
        propertyNotice.value = archived ? 'Property archived.' : 'Property restored.'
      }
      catch (caught) {
        propertyActionError.value = apiErrorMessage(caught, archived ? 'Could not archive this property.' : 'Could not restore this property.')
      }
      finally {
        propertyActionId.value = null
      }
    }

    async function setCustomerArchived(archived: boolean) {
      const current = data.value
      if (!current || archiveStatus.value === 'saving') return
      archiveStatus.value = 'saving'
      archiveError.value = ''
      archiveNotice.value = ''
      try {
        const action = archived ? 'archive' : 'restore'
        const next = await apiFetch<CustomerDetail>(`/api/customers/${current.id}/${action}`, { method: 'POST' })
        remember(next, false)
        archiveConfirm.value = false
        archiveNotice.value = archived ? 'Customer archived.' : 'Customer restored.'
      }
      catch (caught) {
        archiveError.value = apiErrorMessage(caught, archived ? 'Could not archive this customer.' : 'Could not restore this customer.')
      }
      finally {
        archiveStatus.value = 'idle'
      }
    }

    return () => {
      if (!allowed) {
        return (
          <UContainer class="py-10">
            <h1 class="text-2xl font-semibold text-highlighted">Customer</h1>
            <p class="mt-3 text-sm text-error" role="alert">You do not have access to this.</p>
          </UContainer>
        )
      }

      const current = data.value
      if (!current || current.id !== id.value) {
        if (error.value && status.value === 'error') {
          return (
            <UContainer class="py-8">
              <NuxtLink to="/customers" class="text-sm text-muted">Customers</NuxtLink>
              <p class="mt-3 text-sm text-error" role="alert">
                {apiErrorMessage(error.value, 'Could not load this customer.')}
              </p>
            </UContainer>
          )
        }
        return (
          <UContainer class="py-8">
            <p class="text-sm text-muted">Loading customer…</p>
          </UContainer>
        )
      }

      const savingCustomer = customerStatus.value === 'saving'
      const customerMessage = savingCustomer
        ? 'Saving…'
        : customerStatus.value === 'saved'
          ? 'Saved.'
          : customerError.value || notice.value
      const rolesFor = (contactId: string) => contactRoles(contactId, current)

      return (
        <UContainer class="py-8">
          <div class="mx-auto flex max-w-5xl flex-col gap-6" data-testid="customer-detail">
            <div class="space-y-3">
              <NuxtLink to="/customers" class="text-sm text-muted">Customers</NuxtLink>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-2">
                  <h1 class="text-2xl font-semibold tracking-tight text-highlighted">{current.name}</h1>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge color="neutral" variant="subtle">{CUSTOMER_TYPE_LABELS[current.type]}</UBadge>
                    {current.isContract ? <UBadge color="primary" variant="subtle">Contract</UBadge> : null}
                    {current.archivedAt ? <UBadge color="warning" variant="subtle">Archived</UBadge> : null}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  {current.archivedAt
                    ? (
                        <UButton
                          type="button"
                          color="neutral"
                          variant="outline"
                          loading={archiveStatus.value === 'saving'}
                          onClick={() => setCustomerArchived(false)}
                        >
                          Restore customer
                        </UButton>
                      )
                    : archiveConfirm.value
                      ? (
                          <>
                            <UButton
                              type="button"
                              color="neutral"
                              loading={archiveStatus.value === 'saving'}
                              onClick={() => setCustomerArchived(true)}
                            >
                              Archive this customer
                            </UButton>
                            <UButton type="button" color="neutral" variant="ghost" disabled={archiveStatus.value === 'saving'} onClick={() => { archiveConfirm.value = false }}>
                              Cancel
                            </UButton>
                          </>
                        )
                      : (
                          <UButton type="button" color="neutral" variant="outline" onClick={() => { archiveConfirm.value = true }}>
                            Archive
                          </UButton>
                        )}
                </div>
              </div>
              <p aria-live="polite" role={archiveError.value ? 'alert' : undefined} class={archiveError.value ? 'text-sm text-error' : 'text-sm text-muted'}>
                {archiveStatus.value === 'saving' ? 'Saving…' : archiveError.value || archiveNotice.value}
              </p>
            </div>

            <form class={sectionCard} data-testid="customer-form" onSubmit={saveCustomer}>
              <h2 class="text-base font-semibold text-highlighted">Customer</h2>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField class="w-full" label="Name" required error={customerErrors.value.name}>
                  <UInput
                    class="w-full"
                    modelValue={name.value}
                    required
                    autocomplete="organization"
                    disabled={savingCustomer}
                    onUpdate:modelValue={(value: string) => {
                      name.value = value
                      markCustomerEdited()
                    }}
                  />
                </UFormField>
                <UFormField class="w-full" error={customerErrors.value.billingContactId} v-slots={fieldHint('Billing contact', 'Used unless a property names someone else.')}>
                  <USelect
                    class="w-full"
                    placeholder="No billing contact"
                    items={contactOptions(current.contacts, 'No billing contact')}
                    modelValue={selectedContact(billingContactId.value)}
                    disabled={savingCustomer}
                    data-testid="billing-contact"
                    onUpdate:modelValue={(value: string) => {
                      billingContactId.value = storedContact(value)
                      markCustomerEdited()
                    }}
                  />
                </UFormField>
              </div>
              <URadioGroup
                legend="Type"
                orientation="horizontal"
                items={typeChoices}
                modelValue={type.value || undefined}
                disabled={savingCustomer}
                onUpdate:modelValue={(value: CustomerType) => {
                  type.value = value
                  markCustomerEdited()
                }}
              />
              {customerErrors.value.type ? <p class="text-sm text-error">{customerErrors.value.type}</p> : null}
              <UCheckbox
                v-slots={checkboxHint('Contract customer', 'Can be exempt from the service-call charge once that rule is set.')}
                modelValue={isContract.value}
                disabled={savingCustomer}
                onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                  if (typeof value !== 'boolean') return
                  isContract.value = value
                  markCustomerEdited()
                }}
              />
              <UFormField class="w-full" label="Notes" error={customerErrors.value.notes}>
                <UTextarea
                  class="w-full"
                  modelValue={notes.value}
                  rows={3}
                  disabled={savingCustomer}
                  onUpdate:modelValue={(value: string) => {
                    notes.value = value
                    markCustomerEdited()
                  }}
                />
              </UFormField>
              <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
                <UButton type="submit" loading={savingCustomer}>Save customer</UButton>
                <p aria-live="polite" role={customerError.value ? 'alert' : undefined} class="text-sm" data-testid="customer-save-status">
                  <span class={customerError.value ? 'text-error' : 'text-muted'}>{customerMessage}</span>
                </p>
              </div>
            </form>

            <section class={sectionCard}>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-semibold text-highlighted">Contacts</h2>
                <UButton type="button" color="neutral" variant="outline" onClick={openNewContact}>Add contact</UButton>
              </div>
              <p aria-live="polite" role={contactError.value && !contactOpen.value ? 'alert' : undefined} class={contactError.value && !contactOpen.value ? 'text-sm text-error' : 'text-sm text-muted'}>
                {contactNotice.value}
              </p>
              {current.contacts.length === 0 && !contactOpen.value
                ? <p class="text-sm text-muted">No contacts yet.</p>
                : null}
              <ul class="flex flex-col gap-3">
                {current.contacts.map((contact) => {
                  const roles = rolesFor(contact.id)
                  const confirming = confirmingDeleteId.value === contact.id
                  return (
                    <li key={contact.id} class="rounded-lg border border-default bg-elevated/40 px-4 py-4" data-testid="contact-card">
                      <p class="font-medium text-highlighted">{contact.name}</p>
                      <p class="mt-1 text-sm text-muted">
                        {[contact.title, contact.email, contact.phone].filter((part): part is string => Boolean(part)).join(' · ') || 'No email or phone'}
                      </p>
                      {contact.notes ? <p class="mt-1 text-sm text-muted">{contact.notes}</p> : null}
                      {roles.length
                        ? <p class="mt-1 text-sm text-muted">{roles.join(' · ')}</p>
                        : null}
                      {confirming && contactError.value
                        ? <p class="mt-2 text-sm text-error" role="alert">{contactError.value}</p>
                        : null}
                      <div class="mt-3 flex flex-wrap gap-2">
                        {confirming
                          ? (
                              <>
                                <UButton
                                  type="button"
                                  color="neutral"
                                  loading={deletingContactId.value === contact.id}
                                  onClick={() => removeContact(contact.id)}
                                >
                                  Remove this contact
                                </UButton>
                                <UButton type="button" color="neutral" variant="ghost" disabled={deletingContactId.value === contact.id} onClick={() => { confirmingDeleteId.value = null }}>
                                  Cancel
                                </UButton>
                              </>
                            )
                          : (
                              <>
                                <UButton type="button" color="neutral" variant="outline" onClick={() => openContact(contact)}>Edit</UButton>
                                <UButton
                                  type="button"
                                  color="neutral"
                                  variant="ghost"
                                  onClick={() => {
                                    confirmingDeleteId.value = contact.id
                                    contactError.value = ''
                                  }}
                                >
                                  Remove
                                </UButton>
                              </>
                            )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {contactOpen.value ? contactForm(contactStatus.value === 'saving') : null}
            </section>

            <section class={sectionCard}>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-semibold text-highlighted">Properties</h2>
                <UButton type="button" color="neutral" variant="outline" onClick={openNewProperty}>Add property</UButton>
              </div>
              <p class="text-sm text-muted">
                Tax follows the property. A property billing contact replaces the customer billing contact for work at that address.
              </p>
              <p aria-live="polite" class={propertyActionError.value ? 'text-sm text-error' : 'text-sm text-muted'} role={propertyActionError.value ? 'alert' : undefined}>
                {propertyNotice.value || propertyActionError.value}
              </p>
              {current.properties.length === 0 && !propertyOpen.value
                ? <p class="text-sm text-muted">No properties yet. Add one before scheduling work at a site.</p>
                : null}
              <ul class="grid gap-3 md:grid-cols-2">
                {current.properties.map((property) => {
                  const site = current.contacts.find(contact => contact.id === property.siteContactId)
                  const confirming = confirmingArchivePropertyId.value === property.id
                  return (
                    <li key={property.id} class="flex flex-col rounded-lg border border-default bg-elevated/40 px-4 py-4" data-testid="property-card">
                      <p class="font-medium text-highlighted">
                        {propertyTitle(property)}
                        {property.archivedAt ? ' · Archived' : ''}
                      </p>
                      <p class="mt-1 text-sm text-muted">{formatPropertyAddress(property)}</p>
                      <p class="mt-1 text-sm text-muted" data-testid={`property-tax-${property.id}`}>{taxContextLabel(property.tax)}</p>
                      <p class="mt-1 text-sm text-muted" data-testid={`property-invoice-${property.id}`}>{invoiceRecipientLabel(property.invoiceRecipient)}</p>
                      <p class="mt-1 text-sm text-muted">
                        {site ? `Site contact: ${site.name}` : 'No site contact'}
                      </p>
                      {property.accessNotes ? <p class="mt-1 text-sm text-muted">{property.accessNotes}</p> : null}
                      {confirming && propertyActionError.value
                        ? <p class="mt-2 text-sm text-error" role="alert">{propertyActionError.value}</p>
                        : null}
                      <div class="mt-auto flex flex-wrap gap-2 pt-3">
                        <UButton type="button" color="neutral" variant="outline" onClick={() => openProperty(property)}>Edit</UButton>
                        {property.archivedAt
                          ? (
                              <UButton
                                type="button"
                                color="neutral"
                                variant="ghost"
                                loading={propertyActionId.value === property.id}
                                onClick={() => setPropertyArchived(property.id, false)}
                              >
                                Restore
                              </UButton>
                            )
                          : confirming
                            ? (
                                <>
                                  <UButton
                                    type="button"
                                    color="neutral"
                                    loading={propertyActionId.value === property.id}
                                    onClick={() => setPropertyArchived(property.id, true)}
                                  >
                                    Archive this property
                                  </UButton>
                                  <UButton type="button" color="neutral" variant="ghost" disabled={propertyActionId.value === property.id} onClick={() => { confirmingArchivePropertyId.value = null }}>
                                    Cancel
                                  </UButton>
                                </>
                              )
                            : (
                                <UButton
                                  type="button"
                                  color="neutral"
                                  variant="ghost"
                                  onClick={() => {
                                    confirmingArchivePropertyId.value = property.id
                                    propertyActionError.value = ''
                                  }}
                                >
                                  Archive
                                </UButton>
                              )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {propertyOpen.value ? propertyForm(propertyStatus.value === 'saving', current) : null}
            </section>
          </div>
        </UContainer>
      )
    }

    function contactForm(saving: boolean) {
      const draft = contactDraft.value
      return (
        <form class="space-y-4 rounded-lg border border-default bg-elevated/40 p-4" data-testid="contact-form" onSubmit={saveContact}>
          <h3 class="text-base font-semibold text-highlighted">{editingContactId.value ? 'Edit contact' : 'New contact'}</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="Name" required error={contactErrors.value.name}>
              <UInput class="w-full" modelValue={draft.name} required autocomplete="name" disabled={saving} onUpdate:modelValue={(value: string) => patchContact({ name: value })} />
            </UFormField>
            <UFormField class="w-full" label="Title" error={contactErrors.value.title}>
              <UInput class="w-full" modelValue={draft.title} autocomplete="organization-title" disabled={saving} onUpdate:modelValue={(value: string) => patchContact({ title: value })} />
            </UFormField>
            <UFormField class="w-full" label="Email" error={contactErrors.value.email}>
              <UInput class="w-full" modelValue={draft.email} type="email" autocomplete="email" disabled={saving} onUpdate:modelValue={(value: string) => patchContact({ email: value })} />
            </UFormField>
            <UFormField class="w-full" label="Phone" error={contactErrors.value.phone}>
              <UInput class="w-full" modelValue={draft.phone} type="tel" autocomplete="tel" disabled={saving} onUpdate:modelValue={(value: string) => patchContact({ phone: value })} />
            </UFormField>
          </div>
          <UFormField class="w-full" label="Notes" error={contactErrors.value.notes}>
            <UTextarea class="w-full" modelValue={draft.notes} rows={2} disabled={saving} onUpdate:modelValue={(value: string) => patchContact({ notes: value })} />
          </UFormField>
          <p aria-live="polite" role={contactError.value ? 'alert' : undefined} class="text-sm">
            <span class={contactError.value ? 'text-error' : 'text-muted'}>
              {saving ? 'Saving…' : contactError.value}
            </span>
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton type="submit" loading={saving}>{editingContactId.value ? 'Save contact' : 'Add contact'}</UButton>
            <UButton type="button" color="neutral" variant="ghost" disabled={saving} onClick={closeContact}>Cancel</UButton>
          </div>
        </form>
      )
    }

    function propertyForm(saving: boolean, current: CustomerDetail) {
      const draft = propertyDraft.value
      return (
        <form class="space-y-4 rounded-lg border border-default bg-elevated/40 p-4" data-testid="property-form" onSubmit={saveProperty}>
          <h3 class="text-base font-semibold text-highlighted">{editingPropertyId.value ? 'Edit property' : 'New property'}</h3>
          <UFormField class="w-full" label="Property name" error={propertyErrors.value.name}>
            <UInput class="w-full" modelValue={draft.name} disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ name: value })} />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="Street address" required error={propertyErrors.value.addressLine1}>
              <UInput class="w-full" modelValue={draft.addressLine1} required autocomplete="address-line1" disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ addressLine1: value })} />
            </UFormField>
            <UFormField class="w-full" label="Address line 2" error={propertyErrors.value.addressLine2}>
              <UInput class="w-full" modelValue={draft.addressLine2} autocomplete="address-line2" disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ addressLine2: value })} />
            </UFormField>
            <UFormField class="w-full" label="City" required error={propertyErrors.value.city}>
              <UInput class="w-full" modelValue={draft.city} required autocomplete="address-level2" disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ city: value })} />
            </UFormField>
            <UFormField class="w-full" label="ZIP code" required error={propertyErrors.value.postalCode}>
              <UInput class="w-full" modelValue={draft.postalCode} required autocomplete="postal-code" disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ postalCode: value })} />
            </UFormField>
          </div>
          <URadioGroup
            legend="State"
            orientation="horizontal"
            items={stateChoices}
            modelValue={draft.state || undefined}
            disabled={saving}
            onUpdate:modelValue={(value: ServiceState) => patchProperty({ state: value })}
          />
          {propertyErrors.value.state ? <p class="text-sm text-error">{propertyErrors.value.state}</p> : null}
          <UFormField class="w-full" error={propertyErrors.value.taxJurisdiction} v-slots={fieldHint('Tax jurisdiction', 'County or city. Tax for work at this address comes from this property.')}>
            <UInput class="w-full" modelValue={draft.taxJurisdiction} disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ taxJurisdiction: value })} />
          </UFormField>
          <UCheckbox
            label="Tax exempt"
            modelValue={draft.taxExempt}
            disabled={saving}
            onUpdate:modelValue={(value: boolean | 'indeterminate') => {
              if (typeof value === 'boolean') patchProperty({ taxExempt: value })
            }}
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="Site contact" error={propertyErrors.value.siteContactId}>
              <USelect
                class="w-full"
                placeholder="No site contact"
                items={contactOptions(current.contacts, 'No site contact')}
                modelValue={selectedContact(draft.siteContactId)}
                disabled={saving}
                onUpdate:modelValue={(value: string) => patchProperty({ siteContactId: storedContact(value) })}
              />
            </UFormField>
            <UFormField class="w-full" error={propertyErrors.value.billingContactId} v-slots={fieldHint('Billing contact for this property', 'Leave this empty to use the customer billing contact.')}>
              <USelect
                class="w-full"
                placeholder="Use the customer billing contact"
                items={contactOptions(current.contacts, 'Use the customer billing contact')}
                modelValue={selectedContact(draft.billingContactId)}
                disabled={saving}
                data-testid="property-billing-contact"
                onUpdate:modelValue={(value: string) => patchProperty({ billingContactId: storedContact(value) })}
              />
            </UFormField>
          </div>
          <UFormField class="w-full" label="Access notes" error={propertyErrors.value.accessNotes}>
            <UTextarea class="w-full" modelValue={draft.accessNotes} rows={3} disabled={saving} onUpdate:modelValue={(value: string) => patchProperty({ accessNotes: value })} />
          </UFormField>
          <p aria-live="polite" role={propertyError.value ? 'alert' : undefined} class="text-sm" data-testid="property-save-status">
            <span class={propertyError.value ? 'text-error' : 'text-muted'}>
              {saving ? 'Saving…' : propertyError.value}
            </span>
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton type="submit" loading={saving}>{editingPropertyId.value ? 'Save property' : 'Add property'}</UButton>
            <UButton type="button" color="neutral" variant="ghost" disabled={saving} onClick={closeProperty}>Cancel</UButton>
          </div>
        </form>
      )
    }
  },
})

function emptyContact(): ContactDraft {
  return { name: '', title: '', email: '', phone: '', notes: '' }
}

function emptyProperty(): PropertyDraft {
  return {
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    taxJurisdiction: '',
    taxExempt: false,
    accessNotes: '',
    siteContactId: '',
    billingContactId: '',
  }
}

const noContact = 'none'

function contactOptions(contacts: ContactRecord[], emptyLabel: string) {
  return [
    { label: emptyLabel, value: noContact },
    ...contacts.map(contact => ({ label: contactLabel(contact), value: contact.id })),
  ]
}

function selectedContact(value: string): string {
  return value || noContact
}

function storedContact(value: string | undefined): string {
  return !value || value === noContact ? '' : value
}

function contactLabel(contact: ContactRecord): string {
  const reach = contact.email || contact.phone
  return reach ? `${contact.name} · ${reach}` : contact.name
}

function firstParam(value: unknown): string {
  const id = Array.isArray(value) ? value[0] : value
  return typeof id === 'string' ? id : ''
}
