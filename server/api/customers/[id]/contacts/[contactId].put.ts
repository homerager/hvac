import { contactInputSchema } from '../../../../../shared/utils/customers'
import { updateContact } from '../../../../services/customers'
import { readParsed, requireCustomers, routeParam } from '../../../../utils/customer-http'

export default defineEventHandler(async (event) => {
  requireCustomers(event)
  const input = await readParsed(event, contactInputSchema, 'Check the contact and try again.')
  return updateContact(routeParam(event, 'id'), routeParam(event, 'contactId'), input)
})
