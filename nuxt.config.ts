export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@pinia/nuxt', '@nuxt/test-utils/module'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      appUrl: 'http://localhost:3000',
    },
  },

  compatibilityDate: '2026-10-29',

  typescript: {
    strict: true,
    nodeTsConfig: {
      include: [
        '../tests/unit/**/*',
        '../tests/e2e/**/*',
        '../playwright.config.ts',
        '../prisma.config.ts',
        '../prisma/**/*.ts',
      ],
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
