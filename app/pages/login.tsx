import { UButton, UContainer, UInput } from '#components'
import { LOGIN_RATE_LIMIT_MESSAGE } from '../../shared/utils/login-schema'
import CompanyMark from '../components/company-mark'
import { useBranding } from '../composables/branding'

export default defineComponent({
  name: 'LoginPage',
  async setup() {
    const branding = useBranding()
    useSeoMeta({ title: computed(() => `Sign in · ${branding.value.company.displayName}`) })

    const session = useUserSession()
    const route = useRoute()
    const email = ref('')
    const password = ref('')
    const error = ref('')
    const pending = ref(false)

    if (session.loggedIn.value) {
      await navigateTo(safeRedirect(route.query.redirect))
    }

    async function submit(submitEvent: Event) {
      submitEvent.preventDefault()
      if (pending.value) return
      pending.value = true
      error.value = ''
      try {
        await $fetch('/api/auth/login', {
          method: 'POST',
          body: { email: email.value, password: password.value },
        })
        await session.fetch()
        await navigateTo(safeRedirect(route.query.redirect))
      }
      catch (caught) {
        error.value = statusCodeOf(caught) === 429
          ? LOGIN_RATE_LIMIT_MESSAGE
          : 'Invalid email or password.'
      }
      finally {
        pending.value = false
      }
    }

    return () => (
      <UContainer class="py-10">
        <form class="mx-auto flex max-w-sm flex-col gap-4" data-testid="login-form" onSubmit={submit}>
          <div class="space-y-3">
            <CompanyMark />
            <h1 class="text-2xl font-semibold text-highlighted">Sign in</h1>
          </div>
          <label class="flex flex-col gap-1 text-sm">
            Email
            <UInput
              modelValue={email.value}
              type="email"
              autocomplete="username"
              required
              onUpdate:modelValue={(value: string) => { email.value = value }}
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Password
            <UInput
              modelValue={password.value}
              type="password"
              autocomplete="current-password"
              required
              onUpdate:modelValue={(value: string) => { password.value = value }}
            />
          </label>
          {error.value
            ? <p class="text-sm text-error" role="alert">{error.value}</p>
            : null}
          <UButton type="submit" loading={pending.value} block>
            Sign in
          </UButton>
        </form>
      </UContainer>
    )
  },
})

function statusCodeOf(caught: unknown): number | undefined {
  if (!caught || typeof caught !== 'object') return undefined
  if ('statusCode' in caught && typeof caught.statusCode === 'number') return caught.statusCode
  if ('status' in caught && typeof caught.status === 'number') return caught.status
  return undefined
}

function safeRedirect(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value
  return '/'
}
