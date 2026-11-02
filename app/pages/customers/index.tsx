import { NuxtLink, UBadge, UButton, UCheckbox, UContainer, UFormField, UInput } from '#components'
import { CUSTOMER_TYPE_LABELS, type CustomerList } from '../../../shared/utils/customers'
import { hasPermission, isRole } from '../../../shared/utils/rbac'
import { useBranding } from '../../composables/branding'
import { apiErrorMessage, apiFetch } from '../../utils/api'

definePageMeta({
  middleware: 'auth',
})

export default defineComponent({
  name: 'CustomersPage',
  async setup() {
    const branding = useBranding()
    const session = useUserSession()
    useSeoMeta({
      title: computed(() => `Customers · ${branding.value.company.displayName}`),
    })

    if (!session.ready.value) await session.fetch()
    const allowed = canManageCustomers(session.user.value?.role)

    const draft = ref('')
    const search = ref('')
    const includeArchived = ref(false)

    const { data, error, refresh, status } = await useAsyncData(
      'customers',
      () => apiFetch<CustomerList>(`/api/customers${listQuery(search.value, includeArchived.value)}`),
      { immediate: allowed },
    )

    async function submit(event: Event) {
      event.preventDefault()
      search.value = draft.value
      await refresh()
    }

    return () => {
      if (!allowed) return denied('Customers')

      const pending = status.value === 'pending'
      const message = error.value ? apiErrorMessage(error.value, 'Could not load customers.') : ''
      const rows = data.value?.customers ?? []

      return (
        <UContainer class="py-8">
          <div class="mx-auto flex max-w-5xl flex-col gap-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-2">
                <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Customers</h1>
                <p class="max-w-2xl text-sm text-muted">
                  Contacts, billing, and the tax context of each property.
                </p>
              </div>
              <UButton to="/customers/new">New customer</UButton>
            </div>

            <form class="flex flex-col gap-4 rounded-xl border border-default bg-default p-5 sm:flex-row sm:items-end" data-testid="customer-search" onSubmit={submit}>
              <UFormField class="w-full min-w-0 flex-1" label="Search">
                <UInput
                  class="w-full"
                  modelValue={draft.value}
                  placeholder="Name, phone, city, or ZIP"
                  onUpdate:modelValue={(value: string) => { draft.value = value }}
                />
              </UFormField>
              <div class="flex flex-wrap items-center gap-4">
                <UButton type="submit" color="neutral" variant="outline" loading={pending}>
                  Search
                </UButton>
                <UCheckbox
                  label="Show archived"
                  modelValue={includeArchived.value}
                  disabled={pending}
                  onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                    if (typeof value !== 'boolean' || status.value === 'pending') return
                    includeArchived.value = value
                    void refresh()
                  }}
                />
              </div>
            </form>

            {message
              ? <p class="text-sm text-error" role="alert">{message}</p>
              : null}

            {pending && !data.value
              ? <p class="text-sm text-muted">Loading customers…</p>
              : null}

            {!pending && !message && rows.length === 0
              ? (
                  <p class="rounded-xl border border-dashed border-default px-4 py-8 text-center text-sm text-muted" data-testid="customers-empty">
                    {search.value.trim() ? 'No customers match this search.' : 'No customers yet.'}
                  </p>
                )
              : null}

            <ul class="flex flex-col gap-3" data-testid="customers-list">
              {rows.map(row => (
                <li key={row.id}>
                  <NuxtLink
                    to={`/customers/${row.id}`}
                    class="block rounded-xl border border-default bg-default px-4 py-4 hover:bg-elevated"
                    data-testid="customer-row"
                  >
                    <span class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-medium text-highlighted">{row.name}</span>
                      <span class="flex flex-wrap gap-1.5">
                        <UBadge color="neutral" variant="subtle">{CUSTOMER_TYPE_LABELS[row.type]}</UBadge>
                        {row.isContract ? <UBadge color="primary" variant="subtle">Contract</UBadge> : null}
                        {row.archivedAt ? <UBadge color="warning" variant="subtle">Archived</UBadge> : null}
                      </span>
                    </span>
                    <span class="mt-1.5 block text-sm text-muted">
                      {`${row.activePropertyCount} ${row.activePropertyCount === 1 ? 'property' : 'properties'}`}
                      {row.billingContactName ? ` · Bills to ${row.billingContactName}` : ' · No billing contact'}
                    </span>
                  </NuxtLink>
                </li>
              ))}
            </ul>

            {data.value?.truncated
              ? <p class="text-sm text-muted">Showing the first 100 matches. Refine the search to see the rest.</p>
              : null}
          </div>
        </UContainer>
      )
    }
  },
})

function listQuery(search: string, includeArchived: boolean): string {
  const params = new URLSearchParams()
  const q = search.trim()
  if (q) params.set('q', q)
  if (includeArchived) params.set('archived', '1')
  const query = params.toString()
  return query ? `?${query}` : ''
}

function canManageCustomers(role: string | undefined): boolean {
  return Boolean(role && isRole(role) && hasPermission(role, 'customers.manage'))
}

function denied(title: string) {
  return (
    <UContainer class="py-10">
      <h1 class="text-2xl font-semibold text-highlighted">{title}</h1>
      <p class="mt-3 text-sm text-error" role="alert">You do not have access to this.</p>
    </UContainer>
  )
}
