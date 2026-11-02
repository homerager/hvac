import { UBadge, UContainer } from '#components'
import CompanyMark from '../components/company-mark'
import { useBranding } from '../composables/branding'

export default defineComponent({
  name: 'HomePage',
  async setup() {
    const branding = useBranding()
    useSeoMeta({ title: computed(() => branding.value.company.displayName) })

    const { data: health, status } = await useFetch('/api/health')
    const apiLabel = computed(() =>
      `API: ${status.value === 'pending' ? '…' : (health.value?.status ?? 'unavailable')}`,
    )

    return () => (
      <UContainer class="py-10 space-y-6">
        <h1 class="text-2xl text-highlighted">
          <CompanyMark />
        </h1>
        <p class="text-muted">Field service, invoicing and payments.</p>
        <UBadge
          data-testid="api-status"
          color={health.value?.status === 'ok' ? 'success' : 'error'}
          variant="subtle"
        >
          {apiLabel.value}
        </UBadge>
      </UContainer>
    )
  },
})
