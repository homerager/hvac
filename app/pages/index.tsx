import { UBadge, UContainer } from '#components'

export default defineComponent({
  name: 'HomePage',
  async setup() {
    useSeoMeta({ title: 'Servora' })

    const { data: health, status } = await useFetch('/api/health')
    const apiLabel = computed(() =>
      `API: ${status.value === 'pending' ? '…' : (health.value?.status ?? 'unavailable')}`,
    )

    return () => (
      <UContainer class="py-10 space-y-6">
        <h1 class="text-2xl font-semibold text-highlighted">Servora HVAC</h1>
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
