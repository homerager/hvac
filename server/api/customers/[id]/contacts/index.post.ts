import { contactInputSchema } from '../../../../../shared/utils/customers'
import { createContact } from '../../../../services/customers'
import { readParsed, requireCustomers, routeParam } from '../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, contactInputSchema, 'Check the contact and try again.')
  return createContact(routeParam(event, 'id'), input)
})
