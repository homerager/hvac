import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DefaultLayout from '~/layouts/default'

describe('nuxt runtime', () => {
  it('exposes the branding theme via app config', () => {
    expect(useAppConfig().ui.colors.primary).toBe('sky')
  })

  it('provides an active pinia instance', () => {
    const useCounter = defineStore('counter', { state: () => ({ count: 1 }) })
    expect(useCounter().count).toBe(1)
  })

  it('renders the default layout', async () => {
    const wrapper = await mountSuspended(DefaultLayout)
    expect(wrapper.text()).toContain('Servora')
  })
})
