import { NuxtLink } from '#components'
import { useBranding } from '../composables/branding'

export default defineComponent({
  name: 'CompanyMark',
  props: {
    linked: { type: Boolean, default: false },
    name: { type: String, default: undefined },
  },
  setup(props) {
    const branding = useBranding()
    return () => {
      const label = props.name ?? branding.value.company.displayName
      const logoUrl = branding.value.logoUrl
      const content = (
        <span class="inline-flex min-w-0 items-center gap-2">
          {logoUrl
            ? <img src={logoUrl} alt="" class="h-8 w-auto max-w-36 object-contain" data-testid="company-logo" />
            : null}
          <span class="truncate font-semibold text-highlighted" data-testid="company-name">{label}</span>
        </span>
      )
      if (!props.linked) return content
      return (
        <NuxtLink to="/" class="min-w-0">
          {content}
        </NuxtLink>
      )
    }
  },
})
