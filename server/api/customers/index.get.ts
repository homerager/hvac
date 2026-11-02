import { createError, getQuery } from 'h3'
import { customerListQuerySchema, formFieldErrors } from '../../../shared/utils/customers'
import { listCustomers } from '../../services/customers'
import { requireCustomers } from '../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const parsed = customerListQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Check the search and try again.',
      data: { fields: formFieldErrors(parsed.error) },
    })
  }
  return listCustomers(parsed.data)
})
