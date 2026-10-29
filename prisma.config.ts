import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Optional so `prisma generate` (postinstall) works without a database; commands that connect fail clearly without it.
  datasource: process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : undefined,
})
