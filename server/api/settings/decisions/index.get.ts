import { getDecisions } from '../../../services/decisions'
import { requirePermission } from '../../../utils/rbac'

export default defineEventHandler((event) => {
  requirePermission(event, 'decisions.manage')
  return getDecisions()
})
