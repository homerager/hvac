import { NuxtLink, UButton, UColorModeButton, UContainer } from '#components'
import { isRole, ROLE_LABELS } from '../../shared/utils/rbac'

export default defineComponent({
  name: 'DefaultLayout',
  setup(_, { slots }) {
    const session = useUserSession()

    async function signOut() {
      await session.clear()
      await navigateTo('/login')
    }

    return () => {
      const current = session.user.value
      const role = current && isRole(current.role) ? ROLE_LABELS[current.role] : ''
      return (
        <div class="min-h-dvh flex flex-col">
          <header class="border-b border-default">
            <UContainer class="h-14 flex items-center justify-between gap-3">
              <NuxtLink to="/" class="font-semibold text-highlighted">
                Servora
              </NuxtLink>
              <div class="flex items-center gap-2">
                {session.loggedIn.value
                  ? (
                      <>
                        <span class="text-sm text-muted" data-testid="current-user">
                          {current?.name}
                          {role ? ` · ${role}` : ''}
                        </span>
                        <UButton color="neutral" variant="ghost" onClick={signOut}>
                          Sign out
                        </UButton>
                      </>
                    )
                  : (
                      <NuxtLink to="/login" class="text-sm text-muted" data-testid="sign-in">
                        Sign in
                      </NuxtLink>
                    )}
                <UColorModeButton />
              </div>
            </UContainer>
          </header>
          <main class="flex-1">{slots.default?.()}</main>
        </div>
      )
    }
  },
})
