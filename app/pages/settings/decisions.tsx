import { UBadge, UButton, UCheckbox, UContainer, UFormField, UInput, URadioGroup, UTextarea } from '#components'
import {
  DECISION_IDS,
  IMPORT_KIND_LABELS,
  IMPORT_KINDS,
  INVOICE_FALLBACK_ROLES,
  OFFLINE_SCOPE_LABELS,
  OFFLINE_SCOPES,
  PAYMENT_ACTION_LABELS,
  PAYMENT_ACTIONS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  REQUIREMENTS_DRAFT,
  SUPER_ADMIN_CAPABILITIES,
  answerFor,
  centsToDollarInput,
  formatPpm,
  latestSignatureDate,
  parseDecisionInput,
  parseSignOffInput,
  type CheckPhotoAnswer,
  type DecisionId,
  type DecisionsResponse,
  type DeliveryAnswer,
  type ImportAnswer,
  type InvoiceApprovalAnswer,
  type InvoiceFallbackRole,
  type OfflineAnswer,
  type PaymentAction,
  type PaymentMethod,
  type PaymentRightsAnswer,
  type ServiceCallAnswer,
  type SuperAdminAnswer,
  type SuperAdminCapability,
  type TaxAndNumberingAnswer,
} from '../../../shared/utils/decisions'
import { hasPermission, isRole, ROLE_LABELS, ROLES, type Role } from '../../../shared/utils/rbac'
import { apiErrorFields, apiErrorMessage, apiFetch } from '../../utils/api'

definePageMeta({
  middleware: 'auth',
})

type YesNoForm = '' | 'yes' | 'no'
type SaveState = 'idle' | 'saving' | 'saved'
type AdminForm = Record<SuperAdminCapability, YesNoForm> & { notes: string }

const YES_NO = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]
const PROVIDER_ITEMS = [
  { label: 'Resend', value: 'resend' },
  { label: 'Postmark', value: 'postmark' },
  { label: 'Other', value: 'other' },
]

export default defineComponent({
  name: 'ClientDecisionsPage',
  async setup() {
    const branding = useBranding()
    const session = useUserSession()
    useSeoMeta({
      title: computed(() => `Client decisions · ${branding.value.company.displayName}`),
    })

    if (!session.ready.value) await session.fetch()
    if (!session.loggedIn.value) {
      await navigateTo({ path: '/login', query: { redirect: '/settings/decisions' } })
      return () => null
    }

    const role = session.user.value?.role
    const allowed = Boolean(role && isRole(role) && hasPermission(role, 'decisions.manage'))
    const register = ref<DecisionsResponse | null>(null)
    const loadError = ref('')
    if (allowed) {
      try {
        register.value = await apiFetch<DecisionsResponse>('/api/settings/decisions')
      }
      catch (caught) {
        loadError.value = apiErrorMessage(caught, 'Could not load client decisions.')
      }
    }

    const invoice = reactive(toInvoiceForm(stored(register.value, 'invoice-approval')))
    const payment = reactive(toPaymentForm(stored(register.value, 'payment-rights')))
    const serviceCall = reactive(toServiceForm(stored(register.value, 'service-call')))
    const tax = reactive(toTaxForm(stored(register.value, 'tax-and-numbering')))
    const delivery = reactive(toDeliveryForm(stored(register.value, 'delivery')))
    const checkPhotos = reactive(toCheckForm(stored(register.value, 'check-photos')))
    const imported = reactive(toImportForm(stored(register.value, 'import')))
    const offline = reactive(toOfflineForm(stored(register.value, 'offline')))
    const admin = reactive(toAdminForm(stored(register.value, 'super-admin')))

    const sectionStatus = reactive(blankRecord<SaveState>('idle'))
    const sectionErrors = reactive(blankRecord<Record<string, string>>({}))
    const sectionMessage = reactive(blankRecord<string>(''))
    const signerName = ref('')
    const signerTitle = ref('')
    const signedOn = ref('')
    const documentTitle = ref<string>(REQUIREMENTS_DRAFT.title)
    const documentDate = ref<string>(REQUIREMENTS_DRAFT.date)
    const signedCopyRef = ref('')
    const attested = ref(false)
    const signStatus = ref<SaveState>('idle')
    const signError = ref('')
    const signFields = ref<Record<string, string>>({})

    function mark(id: DecisionId) {
      if (sectionStatus[id] === 'saving') return
      sectionStatus[id] = 'idle'
      sectionMessage[id] = ''
      sectionErrors[id] = {}
    }

    function changed<T>(id: DecisionId, assign: (value: T) => void) {
      return (value: T) => {
        assign(value)
        mark(id)
      }
    }

    function changedSign(assign: (value: string) => void) {
      return (value: string) => {
        assign(value)
        signStatus.value = 'idle'
      }
    }

    function fill(id: DecisionId, response: DecisionsResponse) {
      switch (id) {
        case 'invoice-approval':
          Object.assign(invoice, toInvoiceForm(answerFor(response, id)))
          return
        case 'payment-rights':
          Object.assign(payment, toPaymentForm(answerFor(response, id)))
          return
        case 'service-call':
          Object.assign(serviceCall, toServiceForm(answerFor(response, id)))
          return
        case 'tax-and-numbering':
          Object.assign(tax, toTaxForm(answerFor(response, id)))
          return
        case 'delivery':
          Object.assign(delivery, toDeliveryForm(answerFor(response, id)))
          return
        case 'check-photos':
          Object.assign(checkPhotos, toCheckForm(answerFor(response, id)))
          return
        case 'import':
          Object.assign(imported, toImportForm(answerFor(response, id)))
          return
        case 'offline':
          Object.assign(offline, toOfflineForm(answerFor(response, id)))
          return
        case 'super-admin':
          Object.assign(admin, toAdminForm(answerFor(response, id)))
      }
    }

    function payload(id: DecisionId): unknown {
      switch (id) {
        case 'invoice-approval':
          return { ...invoice }
        case 'payment-rights':
          return {
            secondApproval: payment.secondApproval,
            secondApproverRoles: [...payment.secondApproverRoles],
            methods: payment.methods,
          }
        case 'service-call':
          return { ...serviceCall, waiveRoles: [...serviceCall.waiveRoles] }
        case 'tax-and-numbering':
          return { ...tax }
        case 'delivery':
          return { ...delivery }
        case 'check-photos':
          return { ...checkPhotos, viewerRoles: [...checkPhotos.viewerRoles] }
        case 'import':
          return { include: [...imported.include], notes: imported.notes }
        case 'offline':
          return { ...offline }
        case 'super-admin':
          return { ...admin }
      }
    }

    async function save(id: DecisionId) {
      if (sectionStatus[id] === 'saving') return
      sectionMessage[id] = ''
      sectionErrors[id] = {}
      const body = payload(id)
      const parsed = parseDecisionInput(id, body)
      if (!parsed.ok) {
        sectionErrors[id] = parsed.fields
        sectionMessage[id] = 'Check this decision and try again.'
        sectionStatus[id] = 'idle'
        return
      }
      sectionStatus[id] = 'saving'
      try {
        const saved = await apiFetch<DecisionsResponse>(`/api/settings/decisions/${id}`, { method: 'PUT', body })
        register.value = saved
        fill(id, saved)
        sectionStatus[id] = 'saved'
      }
      catch (caught) {
        sectionStatus[id] = 'idle'
        sectionErrors[id] = apiErrorFields(caught)
        sectionMessage[id] = apiErrorMessage(caught, 'Could not save this decision.')
      }
    }

    async function reopen(id: DecisionId) {
      if (sectionStatus[id] === 'saving') return
      sectionMessage[id] = ''
      sectionErrors[id] = {}
      sectionStatus[id] = 'saving'
      try {
        const saved = await apiFetch<DecisionsResponse>(`/api/settings/decisions/${id}`, {
          method: 'PUT',
          body: { reopen: true },
        })
        register.value = saved
        fill(id, saved)
        sectionMessage[id] = 'Reopened.'
        sectionStatus[id] = 'saved'
      }
      catch (caught) {
        sectionStatus[id] = 'idle'
        sectionMessage[id] = apiErrorMessage(caught, 'Could not reopen this decision.')
      }
    }

    async function recordSignature(event: Event) {
      event.preventDefault()
      if (signStatus.value === 'saving') return
      signError.value = ''
      signFields.value = {}
      const body = {
        signerName: signerName.value,
        signerTitle: signerTitle.value,
        signedOn: signedOn.value,
        documentTitle: documentTitle.value,
        documentDate: documentDate.value,
        signedCopyRef: signedCopyRef.value,
        attested: attested.value === true,
      }
      const parsed = parseSignOffInput(body, latestSignatureDate())
      if (!parsed.ok) {
        signFields.value = parsed.fields
        signError.value = 'Check the signature details and try again.'
        signStatus.value = 'idle'
        return
      }
      signStatus.value = 'saving'
      try {
        register.value = await apiFetch<DecisionsResponse>('/api/settings/decisions/sign-off', { method: 'POST', body })
        attested.value = false
        signStatus.value = 'saved'
      }
      catch (caught) {
        signStatus.value = 'idle'
        signFields.value = apiErrorFields(caught)
        signError.value = apiErrorMessage(caught, 'Could not record the signature.')
      }
    }

    function item(id: DecisionId) {
      return register.value?.decisions.find(decision => decision.id === id)
    }

    function statusText(id: DecisionId): string {
      if (sectionStatus[id] === 'saving') return 'Saving…'
      if (sectionMessage[id]) return sectionMessage[id]
      if (sectionStatus[id] === 'saved') return 'Saved.'
      return ''
    }

    function failed(id: DecisionId): boolean {
      return sectionStatus[id] === 'idle' && sectionMessage[id].length > 0
    }

    function fieldError(id: DecisionId, key: string) {
      return sectionErrors[id][key]
    }

    function toggleRole(selected: Role[], roleName: Role, on: boolean): Role[] {
      return on ? [...selected, roleName] : selected.filter(itemRole => itemRole !== roleName)
    }

    function busy(id: DecisionId): boolean {
      return sectionStatus[id] === 'saving'
    }

    return () => {
      if (!allowed) {
        return (
          <UContainer class="py-10">
            <h1 class="text-2xl font-semibold text-highlighted">Client decisions</h1>
            <p class="mt-3 text-sm text-error" role="alert">You do not have access to this.</p>
          </UContainer>
        )
      }
      if (loadError.value || !register.value) {
        return (
          <UContainer class="py-10">
            <h1 class="text-2xl font-semibold text-highlighted">Client decisions</h1>
            <p class="mt-3 text-sm text-error" role="alert">{loadError.value || 'Could not load client decisions.'}</p>
          </UContainer>
        )
      }

      const current = register.value
      const signature = current.signOff
      const progressText = signature
        ? `${current.progress.answered} of ${current.progress.total} answered. Signed by ${signature.signerName} on ${displayDate(signature.signedOn)}.`
        : `${current.progress.answered} of ${current.progress.total} answered. Requirements not signed.`

      return (
        <UContainer class="py-8">
          <div class="mx-auto max-w-3xl space-y-6">
            <header class="space-y-2">
              <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Client decisions</h1>
              <p class="text-sm" data-testid="decisions-progress">{progressText}</p>
              <p class="max-w-2xl text-sm text-muted">
                These nine decisions block live invoicing. Leave one open until the client answers it. The
                {' '}
                {displayDate(REQUIREMENTS_DRAFT.date)}
                {' '}
                requirements draft is not a client commitment until they sign a version that includes the answers.
              </p>
              <p class="max-w-2xl text-sm text-muted">
                Recording a signature stores that the client signed. It does not change access, tax, or the service-call charge.
              </p>
              {current.signed ? <p class="text-sm text-muted">Saving a change clears the recorded signature.</p> : null}
            </header>

            {section('invoice-approval', invoiceBody())}
            {section('payment-rights', paymentBody())}
            {section('service-call', serviceBody())}
            {section('tax-and-numbering', taxBody())}
            {section('delivery', deliveryBody())}
            {section('check-photos', checkBody())}
            {section('import', importBody())}
            {section('offline', offlineBody())}
            {section('super-admin', adminBody())}
            {signOffBody(current)}
          </div>
        </UContainer>
      )
    }

    function section(id: DecisionId, body: unknown) {
      const decision = item(id)
      const text = statusText(id)
      const isFailed = failed(id)
      return (
        <section class="space-y-4 rounded-xl border border-default bg-default p-5" data-testid={`decision-${id}`}>
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-highlighted">{decision?.title}</h2>
              <UBadge color={decision?.answered ? 'success' : 'neutral'} variant="subtle">
                {decision?.answered ? 'Answered' : 'Open'}
              </UBadge>
            </div>
            <p class="text-sm text-muted">{decision?.why}</p>
          </div>
          {decision?.summary ? <p class="text-sm" data-testid={`summary-${id}`}>{decision.summary}</p> : null}
          {body}
          <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
            <UButton type="button" loading={busy(id)} data-testid={`save-${id}`} onClick={() => save(id)}>
              Save answer
            </UButton>
            {decision?.answered
              ? (
                  <UButton type="button" color="neutral" variant="ghost" disabled={busy(id)} data-testid={`reopen-${id}`} onClick={() => reopen(id)}>
                    Reopen
                  </UButton>
                )
              : null}
            {text
              ? (
                  <p aria-live="polite" role={isFailed ? 'alert' : undefined} class={isFailed ? 'text-sm text-error' : 'text-sm text-muted'} data-testid={`status-${id}`}>
                    {text}
                  </p>
                )
              : null}
          </div>
        </section>
      )
    }

    function invoiceBody() {
      return (
        <div class="space-y-4">
          <URadioGroup
            legend="Owner approves every invoice"
            orientation="horizontal"
            items={YES_NO}
            modelValue={invoice.requireOwnerApproval || undefined}
            disabled={busy('invoice-approval')}
            onUpdate:modelValue={(value: 'yes' | 'no') => {
              invoice.requireOwnerApproval = value
              if (value === 'no') invoice.fallbackRole = ''
              mark('invoice-approval')
            }}
          />
          {errorLine('invoice-approval', 'requireOwnerApproval')}
          {invoice.requireOwnerApproval === 'yes'
            ? (
                <URadioGroup
                  legend="Who acts when the owner is unavailable"
                  items={INVOICE_FALLBACK_ROLES.map(fallback => ({ label: ROLE_LABELS[fallback], value: fallback }))}
                  modelValue={invoice.fallbackRole || undefined}
                  disabled={busy('invoice-approval')}
                  onUpdate:modelValue={(value: InvoiceFallbackRole) => {
                    invoice.fallbackRole = value
                    mark('invoice-approval')
                  }}
                />
              )
            : null}
          {errorLine('invoice-approval', 'fallbackRole')}
        </div>
      )
    }

    function paymentBody() {
      return (
        <div class="space-y-4">
          <p class="text-sm text-muted">
            This is the client’s rule for each method. The app still allows only the owner and super admin to handle payments until that signed rule is applied.
          </p>
          <URadioGroup
            legend="Second approval required"
            orientation="horizontal"
            items={YES_NO}
            modelValue={payment.secondApproval || undefined}
            disabled={busy('payment-rights')}
            onUpdate:modelValue={(value: 'yes' | 'no') => {
              payment.secondApproval = value
              if (value === 'no') payment.secondApproverRoles = []
              mark('payment-rights')
            }}
          />
          {errorLine('payment-rights', 'secondApproval')}
          {payment.secondApproval === 'yes' ? roleSet('Who gives the second approval', payment.secondApproverRoles, 'payment-rights', 'secondApproverRoles', (roles) => { payment.secondApproverRoles = roles }) : null}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr class="border-b border-default text-left">
                  <th class="py-2 pr-3 font-medium">Method</th>
                  {PAYMENT_ACTIONS.map(action => <th key={action} class="px-2 py-2 font-medium">{PAYMENT_ACTION_LABELS[action]}</th>)}
                </tr>
              </thead>
              <tbody>
                {PAYMENT_METHODS.map(method => (
                  <tr key={method} class="border-b border-default align-top">
                    <th class="py-3 pr-3 text-left font-medium">{PAYMENT_METHOD_LABELS[method]}</th>
                    {PAYMENT_ACTIONS.map(action => (
                      <td key={action} class="px-2 py-3">
                        <div class="space-y-1">
                          {ROLES.map(roleName => (
                            <UCheckbox
                              key={roleName}
                              label={ROLE_LABELS[roleName]}
                              modelValue={payment.methods[method][action].includes(roleName)}
                              disabled={busy('payment-rights')}
                              onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                                if (typeof value !== 'boolean') return
                                payment.methods[method][action] = toggleRole(payment.methods[method][action], roleName, value)
                                mark('payment-rights')
                              }}
                            />
                          ))}
                        </div>
                        {errorLine('payment-rights', `methods.${method}.${action}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    function serviceBody() {
      return (
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="Service-call rate (USD)" required error={fieldError('service-call', 'amount')}>
              <UInput class="w-full" modelValue={serviceCall.amount} inputmode="decimal" disabled={busy('service-call')} onUpdate:modelValue={changed('service-call', (value: string) => { serviceCall.amount = value })} />
            </UFormField>
            <UFormField class="w-full" label="Included minutes" required error={fieldError('service-call', 'includedMinutes')}>
              <UInput class="w-full" modelValue={serviceCall.includedMinutes} inputmode="numeric" disabled={busy('service-call')} onUpdate:modelValue={changed('service-call', (value: string) => { serviceCall.includedMinutes = value })} />
            </UFormField>
          </div>
          <URadioGroup
            legend="Contract customers are exempt"
            orientation="horizontal"
            items={YES_NO}
            modelValue={serviceCall.exemptContractCustomers || undefined}
            disabled={busy('service-call')}
            onUpdate:modelValue={changed('service-call', (value: 'yes' | 'no') => { serviceCall.exemptContractCustomers = value })}
          />
          {errorLine('service-call', 'exemptContractCustomers')}
          {roleSet('Who may waive the charge', serviceCall.waiveRoles, 'service-call', 'waiveRoles', (roles) => { serviceCall.waiveRoles = roles }, 'Leave this empty if nobody may waive it.')}
          <UFormField class="w-full" label="Exceptions" required error={fieldError('service-call', 'exceptions')} description="Write None if there are no exceptions.">
            <UTextarea class="w-full" modelValue={serviceCall.exceptions} rows={3} disabled={busy('service-call')} onUpdate:modelValue={changed('service-call', (value: string) => { serviceCall.exceptions = value })} />
          </UFormField>
        </div>
      )
    }

    function taxBody() {
      return (
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="New York rate (%)" required error={fieldError('tax-and-numbering', 'nyRate')} description="Example: 8.875">
              <UInput class="w-full" modelValue={tax.nyRate} inputmode="decimal" disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.nyRate = value })} />
            </UFormField>
            <UFormField class="w-full" label="New Jersey rate (%)" required error={fieldError('tax-and-numbering', 'njRate')} description="Example: 6.625">
              <UInput class="w-full" modelValue={tax.njRate} inputmode="decimal" disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.njRate = value })} />
            </UFormField>
          </div>
          <UFormField class="w-full" label="New York rule" required error={fieldError('tax-and-numbering', 'nyRule')}>
            <UTextarea class="w-full" modelValue={tax.nyRule} rows={3} disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.nyRule = value })} />
          </UFormField>
          <UFormField class="w-full" label="New Jersey rule" required error={fieldError('tax-and-numbering', 'njRule')}>
            <UTextarea class="w-full" modelValue={tax.njRule} rows={3} disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.njRule = value })} />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField class="w-full" label="Days until payment is due" required error={fieldError('tax-and-numbering', 'paymentTermsDays')} description="0 means due on receipt.">
              <UInput class="w-full" modelValue={tax.paymentTermsDays} inputmode="numeric" disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.paymentTermsDays = value })} />
            </UFormField>
            <UFormField class="w-full" label="Invoice number format" required error={fieldError('tax-and-numbering', 'numberFormat')} description="Use {SEQ} once. Optional: {YYYY}, {YY}, {MM}.">
              <UInput class="w-full" modelValue={tax.numberFormat} disabled={busy('tax-and-numbering')} onUpdate:modelValue={changed('tax-and-numbering', (value: string) => { tax.numberFormat = value })} />
            </UFormField>
          </div>
        </div>
      )
    }

    function deliveryBody() {
      return (
        <div class="space-y-4">
          <URadioGroup
            legend="How invoices and receipts are sent"
            items={[{ label: 'Email', value: 'email' }, { label: 'Staff send them manually', value: 'manual' }]}
            modelValue={delivery.channel || undefined}
            disabled={busy('delivery')}
            onUpdate:modelValue={changed('delivery', (value: 'email' | 'manual') => { delivery.channel = value })}
          />
          {errorLine('delivery', 'channel')}
          {delivery.channel === 'email'
            ? (
                <div class="space-y-4">
                  <URadioGroup
                    legend="Email provider"
                    orientation="horizontal"
                    items={PROVIDER_ITEMS}
                    modelValue={delivery.provider || undefined}
                    disabled={busy('delivery')}
                    onUpdate:modelValue={changed('delivery', (value: 'resend' | 'postmark' | 'other') => { delivery.provider = value })}
                  />
                  {errorLine('delivery', 'provider')}
                  {delivery.provider === 'other'
                    ? (
                        <UFormField class="w-full" label="Provider name" required error={fieldError('delivery', 'providerName')}>
                          <UInput class="w-full" modelValue={delivery.providerName} disabled={busy('delivery')} onUpdate:modelValue={changed('delivery', (value: string) => { delivery.providerName = value })} />
                        </UFormField>
                      )
                    : null}
                </div>
              )
            : null}
          <URadioGroup
            legend="Overdue reminders"
            items={[{ label: 'No reminders', value: 'none' }, { label: 'On a schedule', value: 'scheduled' }]}
            modelValue={delivery.reminders || undefined}
            disabled={busy('delivery')}
            onUpdate:modelValue={changed('delivery', (value: 'none' | 'scheduled') => { delivery.reminders = value })}
          />
          {errorLine('delivery', 'reminders')}
          {delivery.reminders === 'scheduled'
            ? (
                <UFormField class="w-full" label="Days after the due date" required error={fieldError('delivery', 'reminderDays')} description="Example: 7, 14, 30">
                  <UInput class="w-full" modelValue={delivery.reminderDays} disabled={busy('delivery')} onUpdate:modelValue={changed('delivery', (value: string) => { delivery.reminderDays = value })} />
                </UFormField>
              )
            : null}
        </div>
      )
    }

    function checkBody() {
      return (
        <div class="space-y-4">
          {roleSet('Who may view check photos', checkPhotos.viewerRoles, 'check-photos', 'viewerRoles', (roles) => { checkPhotos.viewerRoles = roles })}
          <URadioGroup
            legend="How long check photos are kept"
            items={[{ label: 'A set number of days', value: 'days' }, { label: 'Indefinitely', value: 'indefinite' }]}
            modelValue={checkPhotos.retention || undefined}
            disabled={busy('check-photos')}
            onUpdate:modelValue={changed('check-photos', (value: 'days' | 'indefinite') => { checkPhotos.retention = value })}
          />
          {errorLine('check-photos', 'retention')}
          {checkPhotos.retention === 'days'
            ? (
                <UFormField class="w-full" label="Days to keep check photos" required error={fieldError('check-photos', 'retentionDays')}>
                  <UInput class="w-full" modelValue={checkPhotos.retentionDays} inputmode="numeric" disabled={busy('check-photos')} onUpdate:modelValue={changed('check-photos', (value: string) => { checkPhotos.retentionDays = value })} />
                </UFormField>
              )
            : null}
        </div>
      )
    }

    function importBody() {
      return (
        <div class="space-y-4">
          <fieldset class="space-y-2">
            <legend class="text-sm font-medium text-highlighted">Records to connect or import</legend>
            <p class="text-sm text-muted">Leave these unchecked if the pilot imports nothing.</p>
            <div class="flex flex-col gap-2">
              {IMPORT_KINDS.map(kind => (
                <UCheckbox
                  key={kind}
                  label={IMPORT_KIND_LABELS[kind]}
                  modelValue={imported.include.includes(kind)}
                  disabled={busy('import')}
                  onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                    if (typeof value !== 'boolean') return
                    imported.include = value ? [...imported.include, kind] : imported.include.filter(itemKind => itemKind !== kind)
                    mark('import')
                  }}
                />
              ))}
            </div>
          </fieldset>
          <UFormField class="w-full" label="What the pilot should use" required error={fieldError('import', 'notes')} description="If nothing is imported, write that here.">
            <UTextarea class="w-full" modelValue={imported.notes} rows={3} disabled={busy('import')} onUpdate:modelValue={changed('import', (value: string) => { imported.notes = value })} />
          </UFormField>
        </div>
      )
    }

    function offlineBody() {
      return (
        <div class="space-y-4">
          <URadioGroup
            legend="What has to work without a connection"
            items={OFFLINE_SCOPES.map(scope => ({ label: OFFLINE_SCOPE_LABELS[scope], value: scope }))}
            modelValue={offline.scope || undefined}
            disabled={busy('offline')}
            onUpdate:modelValue={changed('offline', (value: OfflineAnswer['scope']) => { offline.scope = value })}
          />
          {errorLine('offline', 'scope')}
          <UFormField class="w-full" label="Must work offline" required error={fieldError('offline', 'mustWork')}>
            <UTextarea class="w-full" modelValue={offline.mustWork} rows={3} disabled={busy('offline')} onUpdate:modelValue={changed('offline', (value: string) => { offline.mustWork = value })} />
          </UFormField>
          <UFormField class="w-full" label="Can wait for a successful sync" required error={fieldError('offline', 'canWait')}>
            <UTextarea class="w-full" modelValue={offline.canWait} rows={3} disabled={busy('offline')} onUpdate:modelValue={changed('offline', (value: string) => { offline.canWait = value })} />
          </UFormField>
        </div>
      )
    }

    function adminBody() {
      return (
        <div class="space-y-4">
          <p class="text-sm text-muted">
            This is the client’s decision. Signing in and access stay on the current role matrix until that signed decision is applied.
          </p>
          {SUPER_ADMIN_CAPABILITIES.map(([key, label]) => (
            <div key={key} class="space-y-1">
              <URadioGroup
                legend={label}
                orientation="horizontal"
                items={YES_NO}
                modelValue={admin[key] || undefined}
                disabled={busy('super-admin')}
                onUpdate:modelValue={changed('super-admin', (value: 'yes' | 'no') => { admin[key] = value })}
              />
              {errorLine('super-admin', key)}
            </div>
          ))}
          <UFormField class="w-full" label="Notes" error={fieldError('super-admin', 'notes')}>
            <UTextarea class="w-full" modelValue={admin.notes} rows={3} disabled={busy('super-admin')} onUpdate:modelValue={changed('super-admin', (value: string) => { admin.notes = value })} />
          </UFormField>
        </div>
      )
    }

    function signOffBody(current: DecisionsResponse) {
      const signature = current.signOff
      return (
        <section class="space-y-4 rounded-xl border border-default bg-default p-5" data-testid="decisions-signoff">
          <div class="space-y-1">
            <h2 class="text-base font-semibold text-highlighted">Signed requirements</h2>
            <p class="text-sm text-muted">Record a signature only after the client has signed a requirements version that includes these nine answers.</p>
          </div>
          {signature
            ? (
                <div class="space-y-1 text-sm" data-testid="signoff-recorded">
                  <p>
                    {signature.signerName}
                    {', '}
                    {signature.signerTitle}
                    {', signed '}
                    {signature.documentTitle}
                    {' dated '}
                    {displayDate(signature.documentDate)}
                    {' on '}
                    {displayDate(signature.signedOn)}
                    .
                  </p>
                  {signature.signedCopyRef
                    ? (
                        <p class="text-muted">
                          Signed copy:
                          {' '}
                          {signature.signedCopyRef}
                        </p>
                      )
                    : null}
                </div>
              )
            : (
                <form class="space-y-4" onSubmit={recordSignature}>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <UFormField class="w-full" label="Signer name" required error={signFields.value.signerName}>
                      <UInput class="w-full" modelValue={signerName.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { signerName.value = value })} />
                    </UFormField>
                    <UFormField class="w-full" label="Signer title" required error={signFields.value.signerTitle}>
                      <UInput class="w-full" modelValue={signerTitle.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { signerTitle.value = value })} />
                    </UFormField>
                    <UFormField class="w-full" label="Date signed" required error={signFields.value.signedOn}>
                      <UInput class="w-full" type="date" modelValue={signedOn.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { signedOn.value = value })} />
                    </UFormField>
                    <UFormField class="w-full" label="Document date" required error={signFields.value.documentDate}>
                      <UInput class="w-full" type="date" modelValue={documentDate.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { documentDate.value = value })} />
                    </UFormField>
                  </div>
                  <UFormField class="w-full" label="Signed document title" required error={signFields.value.documentTitle}>
                    <UInput class="w-full" modelValue={documentTitle.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { documentTitle.value = value })} />
                  </UFormField>
                  <UFormField class="w-full" label="Where the signed copy is kept" error={signFields.value.signedCopyRef}>
                    <UInput class="w-full" modelValue={signedCopyRef.value} disabled={signStatus.value === 'saving'} onUpdate:modelValue={changedSign((value: string) => { signedCopyRef.value = value })} />
                  </UFormField>
                  <UCheckbox
                    label="The client signed this version of the requirements, and these nine decisions are the ones they approved."
                    modelValue={attested.value}
                    disabled={signStatus.value === 'saving'}
                    onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                      if (typeof value !== 'boolean') return
                      attested.value = value
                      signStatus.value = 'idle'
                    }}
                  />
                  {signFields.value.attested ? <p class="text-sm text-error">{signFields.value.attested}</p> : null}
                  <div class="flex flex-wrap items-center gap-3">
                    <UButton type="submit" loading={signStatus.value === 'saving'} data-testid="record-signoff">Record signature</UButton>
                    <p aria-live="polite" role={signError.value ? 'alert' : undefined} class={signError.value ? 'text-sm text-error' : 'text-sm text-muted'} data-testid="signoff-status">
                      {signStatus.value === 'saving' ? 'Saving…' : signStatus.value === 'saved' && !signError.value ? 'Saved.' : signError.value}
                    </p>
                  </div>
                </form>
              )}
          {current.voidedSignOffs.length
            ? (
                <ul class="space-y-1 text-sm text-muted">
                  {current.voidedSignOffs.slice(0, 3).map(voided => (
                    <li key={`${voided.recordedAt}:${voided.voidedAt}`}>
                      Signature by
                      {' '}
                      {voided.signerName}
                      {' on '}
                      {displayDate(voided.signedOn)}
                      {' was cleared: '}
                      {voided.voidReason}
                    </li>
                  ))}
                </ul>
              )
            : null}
        </section>
      )
    }

    function roleSet(legend: string, selected: Role[], id: DecisionId, errorKey: string, onChange: (roles: Role[]) => void, hint?: string) {
      return (
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-highlighted">{legend}</legend>
          {hint ? <p class="text-sm text-muted">{hint}</p> : null}
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            {ROLES.map(roleName => (
              <UCheckbox
                key={roleName}
                label={ROLE_LABELS[roleName]}
                modelValue={selected.includes(roleName)}
                disabled={busy(id)}
                onUpdate:modelValue={(value: boolean | 'indeterminate') => {
                  if (typeof value !== 'boolean') return
                  onChange(toggleRole(selected, roleName, value))
                  mark(id)
                }}
              />
            ))}
          </div>
          {errorLine(id, errorKey)}
        </fieldset>
      )
    }

    function errorLine(id: DecisionId, key: string) {
      const message = fieldError(id, key)
      if (!message) return null
      return <p class="text-sm text-error">{message}</p>
    }
  },
})

function stored<K extends DecisionId>(response: DecisionsResponse | null, id: K) {
  if (!response) return null
  return answerFor(response, id)
}

function toInvoiceForm(answer: InvoiceApprovalAnswer | null) {
  return {
    requireOwnerApproval: (answer ? (answer.requireOwnerApproval ? 'yes' : 'no') : '') as YesNoForm,
    fallbackRole: (answer?.fallbackRole ?? '') as '' | InvoiceFallbackRole,
  }
}

function toPaymentForm(answer: PaymentRightsAnswer | null) {
  const methods = emptyMethods()
  if (!answer) return { secondApproval: '' as YesNoForm, secondApproverRoles: [] as Role[], methods }
  for (const method of PAYMENT_METHODS) {
    for (const action of PAYMENT_ACTIONS) methods[method][action] = [...answer.methods[method][action]]
  }
  return {
    secondApproval: (answer.secondApproval ? 'yes' : 'no') as YesNoForm,
    secondApproverRoles: [...answer.secondApproverRoles],
    methods,
  }
}

function toServiceForm(answer: ServiceCallAnswer | null) {
  return {
    amount: answer ? centsToDollarInput(answer.amountCents) : '',
    includedMinutes: answer ? String(answer.includedMinutes) : '',
    exemptContractCustomers: (answer ? (answer.exemptContractCustomers ? 'yes' : 'no') : '') as YesNoForm,
    waiveRoles: answer ? [...answer.waiveRoles] : [] as Role[],
    exceptions: answer?.exceptions ?? '',
  }
}

function toTaxForm(answer: TaxAndNumberingAnswer | null) {
  return {
    nyRate: answer ? formatPpm(answer.nyRatePpm) : '',
    nyRule: answer?.nyRule ?? '',
    njRate: answer ? formatPpm(answer.njRatePpm) : '',
    njRule: answer?.njRule ?? '',
    paymentTermsDays: answer ? String(answer.paymentTermsDays) : '',
    numberFormat: answer?.numberFormat ?? '',
  }
}

function toDeliveryForm(answer: DeliveryAnswer | null) {
  return {
    channel: (answer?.channel ?? '') as '' | DeliveryAnswer['channel'],
    provider: (answer?.provider ?? '') as '' | NonNullable<DeliveryAnswer['provider']>,
    providerName: answer?.providerName ?? '',
    reminders: (answer?.reminders ?? '') as '' | DeliveryAnswer['reminders'],
    reminderDays: answer ? answer.reminderDaysAfterDue.join(', ') : '',
  }
}

function toCheckForm(answer: CheckPhotoAnswer | null) {
  return {
    viewerRoles: answer ? [...answer.viewerRoles] : [] as Role[],
    retention: (answer?.retention ?? '') as '' | CheckPhotoAnswer['retention'],
    retentionDays: answer?.retentionDays ? String(answer.retentionDays) : '',
  }
}

function toImportForm(answer: ImportAnswer | null) {
  return {
    include: answer ? [...answer.include] : [],
    notes: answer?.notes ?? '',
  }
}

function toOfflineForm(answer: OfflineAnswer | null) {
  return {
    scope: (answer?.scope ?? '') as '' | OfflineAnswer['scope'],
    mustWork: answer?.mustWork ?? '',
    canWait: answer?.canWait ?? '',
  }
}

function toAdminForm(answer: SuperAdminAnswer | null): AdminForm {
  const form = { notes: answer?.notes ?? '' } as AdminForm
  for (const [key] of SUPER_ADMIN_CAPABILITIES) form[key] = answer ? (answer[key] ? 'yes' : 'no') : ''
  return form
}

function emptyMethods(): Record<PaymentMethod, Record<PaymentAction, Role[]>> {
  const methods = {} as Record<PaymentMethod, Record<PaymentAction, Role[]>>
  for (const method of PAYMENT_METHODS) methods[method] = { record: [], confirm: [], void: [], refund: [] }
  return methods
}

function blankRecord<T>(value: T): Record<DecisionId, T> {
  return Object.fromEntries(DECISION_IDS.map((id) => {
    const copy = typeof value === 'object' && value !== null ? {} : value
    return [id, copy]
  })) as Record<DecisionId, T>
}

function displayDate(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)))
}
