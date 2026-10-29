import { NuxtLayout, NuxtPage, UApp } from '#components'

export default defineComponent({
  name: 'App',
  setup() {
    return () => (
      <UApp>
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </UApp>
    )
  },
})
