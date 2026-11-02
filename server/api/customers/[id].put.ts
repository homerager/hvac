import { customerUpdateSchema } from '../../../shared/utils/customers'
import { updateCustomer } from '../../services/customers'
import { readParsed, requireCustomers, routeParam } from '../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, customerUpdateSchema, 'Check the customer details and try again.')
  return updateCustomer(routeParam(event, 'id'), input)
})
