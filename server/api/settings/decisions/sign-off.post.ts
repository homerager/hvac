import { recordSignOff } from '../../../services/decisions'
import { requirePermission } from '../../../utils/rbac'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'decisions.manage')
  return recordSignOff(await readBody(event), actor.id)
})
