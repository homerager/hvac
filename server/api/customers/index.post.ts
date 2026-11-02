import { customerCreateSchema } from '../../../shared/utils/customers'
import { createCustomer } from '../../services/customers'
import { readParsed, requireCustomers } from '../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, customerCreateSchema, 'Check the customer details and try again.')
  return createCustomer(input)
})
