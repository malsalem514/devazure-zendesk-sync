import { CUSTOM_FIELD_PATHS, PILOT_FORM_ID } from '../config.js'
import { fetchSummary } from './backend.js'

const DISPLAYED_FIELD_IDS = [
  50877199973651,
  50877235285395,
  50847215571859
]

const FALLBACK_FIELD_KEYS = ['devFunnelNumber', 'adoWorkItemId', 'adoWorkItemUrl']

async function getValue(client, path) {
  const result = await client.get(path)
  return result[path]
}

async function getValues(client, paths) {
  return client.get(paths)
}

async function loadLinkedFields(client) {
  const entries = FALLBACK_FIELD_KEYS.map((key) => [key, CUSTOM_FIELD_PATHS[key]])
  const values = await getValues(
    client,
    entries.map(([, path]) => path)
  )

  return Object.fromEntries(entries.map(([key, path]) => [key, values[path]]))
}

function normalizeString(value) {
  if (value == null) {
    return null
  }

  const stringValue = String(value).trim()
  return stringValue === '' ? null : stringValue
}

function normalizeNumber(value) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function linkedFromFields(linkedFields) {
  const workItemUrl =
    normalizeString(linkedFields.adoWorkItemUrl) || normalizeString(linkedFields.devFunnelNumber)
  return {
    workItemId: normalizeNumber(linkedFields.adoWorkItemId),
    workItemUrl,
  }
}

function linkedFromBackend(summary) {
  if (!summary?.linked || !summary.workItem) return null
  const wi = summary.workItem
  return {
    workItemId: normalizeNumber(wi.id),
    workItemUrl: normalizeString(wi.url),
    title: normalizeString(wi.title),
    workItemType: normalizeString(wi.workItemType),
    state: normalizeString(wi.state),
    reason: normalizeString(wi.reason),
    assignedTo: normalizeString(wi.assignedTo),
    areaPath: normalizeString(wi.areaPath),
    iterationPath: normalizeString(wi.iterationPath),
    priority: normalizeNumber(wi.priority),
    severity: normalizeString(wi.severity),
    product: normalizeString(wi.product),
    client: normalizeString(wi.client),
    crf: normalizeString(wi.crf),
    bucket: normalizeString(wi.bucket),
    unplanned: wi.unplanned === true ? true : wi.unplanned === false ? false : null,
    tags: Array.isArray(wi.tags) ? wi.tags.map(String).filter(Boolean) : [],
    createdAt: normalizeString(wi.createdAt),
    changedAt: normalizeString(wi.changedAt),
    status: normalizeString(wi.status),
    statusDetail: normalizeString(wi.statusDetail),
    statusTag: normalizeString(wi.statusTag),
    sprint: normalizeString(wi.sprint),
    eta: normalizeString(wi.eta),
    syncHealth: normalizeString(wi.syncHealth),
    lastSyncAt: normalizeString(wi.lastSyncAt),
    lastSyncSource: normalizeString(wi.lastSyncSource),
    customerUpdate: normalizeString(wi.customerUpdate),
  }
}

export async function loadTicketSnapshot(client) {
  // Read the minimum needed to decide pilot-form gating. We deliberately
  // avoid reading anything else (including the backend summary) on
  // non-pilot forms so the app has zero observable footprint outside its
  // pilot scope.
  const baseValues = await getValues(client, ['ticket.id', 'ticket.form.id'])
  const ticketId = baseValues['ticket.id']
  const formId = baseValues['ticket.form.id']
  const numericTicketId = normalizeNumber(ticketId)
  const numericFormId = normalizeNumber(formId)
  const isPilotForm = numericFormId === PILOT_FORM_ID

  if (!isPilotForm) {
    return {
      ticketId: numericTicketId,
      formId: numericFormId,
      subject: null,
      isPilotForm: false,
      summarySource: 'skipped',
      linked: null,
    }
  }

  const subject = await getValue(client, 'ticket.subject')

  // Try the backend summary endpoint for authoritative view model. Only
  // called on the pilot form — agents on other forms never generate
  // backend traffic from this app.
  let backendLinked = null
  let summarySource = 'fields'
  let shouldUseFieldFallback = true
  if (numericTicketId) {
    try {
      const summary = await fetchSummary(client, numericTicketId)
      backendLinked = linkedFromBackend(summary)
      summarySource = summary?.linked ? 'backend' : 'backend_empty'
      shouldUseFieldFallback = false
    } catch (err) {
      summarySource = 'fields_fallback'
    }
  }

  const linked =
    backendLinked ??
    (shouldUseFieldFallback ? linkedFromFields(await loadLinkedFields(client)) : null)

  return {
    ticketId: numericTicketId,
    formId: numericFormId,
    subject: normalizeString(subject),
    isPilotForm: true,
    summarySource,
    linked,
  }
}

export function subscribeToTicketChanges(client, onChange) {
  const eventNames = [
    'ticket.form.id.changed',
    'ticket.subject.changed',
    ...DISPLAYED_FIELD_IDS.map((fieldId) => `ticket.custom_field_${fieldId}.changed`)
  ]

  eventNames.forEach((eventName) => {
    client.on(eventName, onChange)
  })

  return () => {
    if (typeof client.off === 'function') {
      eventNames.forEach((eventName) => {
        client.off(eventName, onChange)
      })
    }
  }
}
