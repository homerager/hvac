import type { Role } from '../utils/rbac'

declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    role: Role
  }

  interface UserSession {
    loggedInAt?: string
  }
}

export {}
