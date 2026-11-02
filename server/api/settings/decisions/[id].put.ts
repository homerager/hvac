import { saveDecision } from '../../../services/decisions'
import { requirePermission } from '../../../utils/rbac'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'decisions.manage')
  return saveDecision(getRouterParam(event, 'id') ?? '', await readBody(event), actor.id)
})
