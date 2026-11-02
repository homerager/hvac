import { defaultPublicBranding, primaryColorForTheme, type BrandThemeId, type PublicBranding } from '../../shared/utils/branding'

export function useBranding() {
  return useState<PublicBranding>('branding', defaultPublicBranding)
}

/** Points Nuxt UI's primary color at the selected standard theme. */
export function applyBrandTheme(theme: BrandThemeId) {
  const colors = useAppConfig().ui?.colors
  if (!colors) return
  colors.primary = primaryColorForTheme(theme)
}
