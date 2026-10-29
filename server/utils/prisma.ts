import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

let client: PrismaClient | undefined

export function usePrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: useServerEnv().DATABASE_URL }),
  })
  return client
}
