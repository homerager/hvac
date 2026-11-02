import { NuxtLink, UButton, UColorModeButton, UContainer } from '#components'
import { companyDetailLines } from '../../shared/utils/branding'
import { hasPermission, isRole, ROLE_LABELS } from '../../shared/utils/rbac'
import CompanyMark from '../components/company-mark'
import { useBranding } from '../composables/branding'

export default defineComponent({
  name: 'DefaultLayout',
  setup(_, { slots }) {
    const session = useUserSession()
    const branding = useBranding()

    async function signOut() {
      await session.clear()
      await navigateTo('/login')
    }

    return () => {
      const current = session.user.value
      const role = current && isRole(current.role) ? current.role : null
      const roleLabel = role ? ROLE_LABELS[role] : ''
      const canManageSettings = role ? hasPermission(role, 'settings.manage') : false
      const detailLines = companyDetailLines(branding.value.company)
      return (
        <div class="min-h-dvh flex flex-col">
          <header class="border-b border-default">
            <UContainer class="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
              <CompanyMark linked />
              <div class="flex shrink-0 items-center gap-2">
                {session.loggedIn.value
                  ? (
                      <>
                        <span class="text-sm text-muted" data-testid="current-user">
                          {current?.name}
                          {roleLabel ? ` · ${roleLabel}` : ''}
                        </span>
                        {canManageSettings
                          ? (
                              <NuxtLink to="/settings" class="text-sm text-muted" data-testid="company-settings">
                                Settings
                              </NuxtLink>
                            )
                          : null}
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
          {detailLines.length
            ? (
                <footer class="border-t border-default" data-testid="company-details">
                  <UContainer class="space-y-1 py-4 text-sm text-muted">
                    {detailLines.map((line, index) => <p key={`${index}:${line}`}>{line}</p>)}
                  </UContainer>
                </footer>
              )
            : null}
        </div>
      )
    }
  },
})
