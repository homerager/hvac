import type { AuthUser } from '../../shared/utils/rbac'

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthUser
  }
}

export {}
