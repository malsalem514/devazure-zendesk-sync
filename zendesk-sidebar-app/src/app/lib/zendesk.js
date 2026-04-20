import { CUSTOM_FIELD_PATHS, PILOT_FORM_ID } from '../config.js'
import { fetchSummary } from './backend.js'

const DISPLAYED_FIELD_IDS = [
  50877199973651,
  50877235285395,
  50877228156563,
  50877235562259,
  50877208001043,
  50877235803539,
  50877218501395,
  50877208248211
]

async function getValue(client, path) {
  const result = await client.get(path)
  return result[path]
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
    status: normalizeString(linkedFields.adoStatus),
    statusDetail: normalizeString(linkedFields.adoStatusDetail),
    sprint: normalizeString(linkedFields.adoSprint),
    eta: normalizeString(linkedFields.adoEta),
    syncHealth: normalizeString(linkedFields.adoSyncHealth),
    lastSyncAt: normalizeString(linkedFields.adoLastSyncAt),
  }
}

function linkedFromBackend(summary) {
  if (!summary?.linked || !summary.workItem) return null
  const wi = summary.workItem
  return {
    workItemId: normalizeNumber(wi.id),
    workItemUrl: normalizeString(wi.url),
    status: normalizeString(wi.status),
    statusDetail: normalizeString(wi.statusDetail),
    sprint: normalizeString(wi.sprint),
    eta: normalizeString(wi.eta),
    syncHealth: normalizeString(wi.syncHealth),
    lastSyncAt: normalizeString(wi.lastSyncAt),
  }
}

export async function loadTicketSnapshot(client) {
  // Read the minimum needed to decide pilot-form gating. We deliberately
  // avoid reading anything else (including the backend summary) on
  // non-pilot forms so the app has zero observable footprint outside its
  // pilot scope.
  const [ticketId, formId] = await Promise.all([
    getValue(client, 'ticket.id'),
    getValue(client, 'ticket.form.id'),
  ])
  const numericTicketId = normalizeNumber(ticketId)
  const numericFormId = normalizeNumber(formId)
  const isPilotForm = numericFormId === PILOT_FORM_ID

  if (!isPilotForm) {
    return {
      ticketId: numericTicketId,
      formId: numericFormId,
      subject: null,
      requesterName: null,
      isPilotForm: false,
      summarySource: 'skipped',
      linked: null,
    }
  }

  const [subject, requesterName] = await Promise.all([
    getValue(client, 'ticket.subject'),
    getValue(client, 'ticket.requester.name'),
  ])

  const linkedEntries = await Promise.all(
    Object.entries(CUSTOM_FIELD_PATHS).map(async ([key, path]) => [key, await getValue(client, path)])
  )
  const linkedFields = Object.fromEntries(linkedEntries)
  const fieldLinked = linkedFromFields(linkedFields)

  // Try the backend summary endpoint for authoritative view model. Only
  // called on the pilot form — agents on other forms never generate
  // backend traffic from this app.
  let backendLinked = null
  let summarySource = 'fields'
  if (numericTicketId) {
    try {
      const summary = await fetchSummary(client, numericTicketId)
      backendLinked = linkedFromBackend(summary)
      summarySource = summary?.linked ? 'backend' : 'backend_empty'
    } catch (err) {
      summarySource = 'fields_fallback'
      // eslint-disable-next-line no-console
      console.warn('[sidebar] summary endpoint unavailable, falling back to field reads', err)
    }
  }

  const linked = backendLinked ?? fieldLinked

  return {
    ticketId: numericTicketId,
    formId: numericFormId,
    subject: normalizeString(subject),
    requesterName: normalizeString(requesterName),
    isPilotForm: true,
    summarySource,
    linked,
  }
}

export function subscribeToTicketChanges(client, onChange) {
  const eventNames = [
    'ticket.updated',
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
