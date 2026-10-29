import { z } from 'zod'

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

export function useServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
