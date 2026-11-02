import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { bindAuditEngine, createAuditExtension } from '../services/audit-log'
import { useServerEnv } from './env'

function createClient() {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: useServerEnv().DATABASE_URL }),
  })
  bindAuditEngine(base)
  return base.$extends(createAuditExtension())
}

export type AppPrismaClient = ReturnType<typeof createClient>

let client: AppPrismaClient | undefined

export function usePrisma(): AppPrismaClient {
  client ??= createClient()
  return client
}
