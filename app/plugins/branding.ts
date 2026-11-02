import type { PublicBranding } from '../../shared/utils/branding'
import { applyBrandTheme, useBranding } from '../composables/branding'
import { apiFetch } from '../utils/api'

export default defineNuxtPlugin(async () => {
  const branding = useBranding()
  if (import.meta.server && process.env.VITEST !== 'true') {
    try {
      // HTTP keeps Prisma inside Nitro. Importing the service here also loads it
      // into Vite SSR, and the two copies corrupt the shared query-compiler wasm.
      branding.value = await apiFetch<PublicBranding>('/api/branding')
    }
    catch {
      // A settings outage still leaves the default mark on the shell.
    }
  }
  applyBrandTheme(branding.value.theme)
})
