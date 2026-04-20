import { CUSTOM_FIELD_PATHS, PILOT_FORM_ID } from '../config.js'

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

export async function loadTicketSnapshot(client) {
  const [ticketId, formId, subject, requesterName] = await Promise.all([
    getValue(client, 'ticket.id'),
    getValue(client, 'ticket.form.id'),
    getValue(client, 'ticket.subject'),
    getValue(client, 'ticket.requester.name')
  ])

  const linkedEntries = await Promise.all(
    Object.entries(CUSTOM_FIELD_PATHS).map(async ([key, path]) => [key, await getValue(client, path)])
  )

  const linkedFields = Object.fromEntries(linkedEntries)
  const workItemUrl =
    normalizeString(linkedFields.adoWorkItemUrl) || normalizeString(linkedFields.devFunnelNumber)

  return {
    ticketId: normalizeNumber(ticketId),
    formId: normalizeNumber(formId),
    subject: normalizeString(subject),
    requesterName: normalizeString(requesterName),
    isPilotForm: normalizeNumber(formId) === PILOT_FORM_ID,
    linked: {
      workItemId: normalizeNumber(linkedFields.adoWorkItemId),
      workItemUrl,
      status: normalizeString(linkedFields.adoStatus),
      statusDetail: normalizeString(linkedFields.adoStatusDetail),
      sprint: normalizeString(linkedFields.adoSprint),
      eta: normalizeString(linkedFields.adoEta),
      syncHealth: normalizeString(linkedFields.adoSyncHealth),
      lastSyncAt: normalizeString(linkedFields.adoLastSyncAt)
    }
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
