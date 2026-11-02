import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { applyBrandTheme, useBranding } from '~/composables/branding'
import DefaultLayout from '~/layouts/default'
import { defaultPublicBranding } from '../../shared/utils/branding'

describe('nuxt runtime', () => {
  it('exposes the branding theme via app config', () => {
    applyBrandTheme('blue')
    expect(useAppConfig().ui.colors.primary).toBe('sky')
  })

  it('applies a standard brand theme to the Nuxt UI primary color', () => {
    applyBrandTheme('teal')
    expect(useAppConfig().ui.colors.primary).toBe('teal')
    applyBrandTheme('blue')
    expect(useAppConfig().ui.colors.primary).toBe('sky')
  })

  it('provides an active pinia instance', () => {
    const useCounter = defineStore('counter', { state: () => ({ count: 1 }) })
    expect(useCounter().count).toBe(1)
  })

  it('renders the company name from branding state', async () => {
    const branding = useBranding()
    branding.value = defaultPublicBranding()
    branding.value.company.displayName = 'Northwind HVAC'
    branding.value.company.phone = '+1 212 555 0100'
    const wrapper = await mountSuspended(DefaultLayout)
    expect(wrapper.get('[data-testid="company-name"]').text()).toBe('Northwind HVAC')
    expect(wrapper.get('[data-testid="company-details"]').text()).toContain('+1 212 555 0100')
    branding.value = defaultPublicBranding()
  })
})
