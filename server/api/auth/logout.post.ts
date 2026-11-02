export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  delete event.context.auth
  return { ok: true as const }
})
