import { requirePermission } from '../utils/rbac'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'audit.read')
  const logs = await usePrisma().auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return { logs }
})
