import { NuxtLink, UColorModeButton, UContainer } from '#components'

export default defineComponent({
  name: 'DefaultLayout',
  setup(_, { slots }) {
    return () => (
      <div class="min-h-dvh flex flex-col">
        <header class="border-b border-default">
          <UContainer class="h-14 flex items-center justify-between">
            <NuxtLink to="/" class="font-semibold text-highlighted">
              Servora
            </NuxtLink>
            <UColorModeButton />
          </UContainer>
        </header>
        <main class="flex-1">{slots.default?.()}</main>
      </div>
    )
  },
})
