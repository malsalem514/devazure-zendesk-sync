import { describe, expect, it } from 'vitest'
import { CUSTOM_FIELD_PATHS, PILOT_FORM_ID } from '../src/app/config.js'
import { loadTicketSnapshot } from '../src/app/lib/zendesk.js'

function createClient({ values = {}, requestResponse = null, requestError = null } = {}) {
  const client = {
    getCalls: [],
    requestCalls: [],
    async get(pathOrPaths) {
      client.getCalls.push(pathOrPaths)

      if (Array.isArray(pathOrPaths)) {
        return Object.fromEntries(pathOrPaths.map((path) => [path, values[path]]))
      }

      return { [pathOrPaths]: values[pathOrPaths] }
    },
    async request(options) {
      client.requestCalls.push(options)
      if (requestError) {
        throw requestError
      }
      return requestResponse
    }
  }

  return client
}

function readCustomFieldsCalls(client) {
  return client.getCalls.filter(
    (call) => Array.isArray(call) && call.some((path) => path.startsWith('ticket.customField:'))
  )
}

describe('loadTicketSnapshot', () => {
  it('does not call the backend or read ADO fields outside the pilot form', async () => {
    const client = createClient({
      values: {
        'ticket.id': '39045',
        'ticket.form.id': '12345'
      }
    })

    const snapshot = await loadTicketSnapshot(client)

    expect(snapshot).toMatchObject({
      ticketId: 39045,
      formId: 12345,
      isPilotForm: false,
      summarySource: 'skipped',
      linked: null
    })
    expect(client.requestCalls).toHaveLength(0)
    expect(readCustomFieldsCalls(client)).toHaveLength(0)
  })

  it('uses the backend summary without reading custom fields when a ticket is linked', async () => {
    const client = createClient({
      values: {
        'ticket.id': '39220',
        'ticket.form.id': String(PILOT_FORM_ID),
        'ticket.subject': 'Investigate sync state'
      },
      requestResponse: {
        linked: true,
        workItem: {
          id: 79922,
          url: 'https://dev.azure.com/example/_workitems/edit/79922',
          status: 'Active'
        }
      }
    })

    const snapshot = await loadTicketSnapshot(client)

    expect(snapshot.summarySource).toBe('backend')
    expect(snapshot.linked).toMatchObject({
      workItemId: 79922,
      workItemUrl: 'https://dev.azure.com/example/_workitems/edit/79922',
      status: 'Active'
    })
    expect(client.requestCalls).toHaveLength(1)
    expect(readCustomFieldsCalls(client)).toHaveLength(0)
  })

  it('falls back to one bulk custom-field read when the backend summary is unavailable', async () => {
    const client = createClient({
      values: {
        'ticket.id': '39221',
        'ticket.form.id': String(PILOT_FORM_ID),
        'ticket.subject': 'Link existing item',
        [CUSTOM_FIELD_PATHS.adoWorkItemId]: '79922',
        [CUSTOM_FIELD_PATHS.adoWorkItemUrl]: 'https://dev.azure.com/example/_workitems/edit/79922'
      },
      requestError: new Error('backend unavailable')
    })

    const snapshot = await loadTicketSnapshot(client)

    expect(snapshot.summarySource).toBe('fields_fallback')
    expect(snapshot.linked).toMatchObject({
      workItemId: 79922,
      workItemUrl: 'https://dev.azure.com/example/_workitems/edit/79922'
    })
    expect(client.requestCalls).toHaveLength(1)
    expect(readCustomFieldsCalls(client)).toHaveLength(1)
  })

  it('does not use stale field fallback when backend says no active link exists', async () => {
    const client = createClient({
      values: {
        'ticket.id': '39222',
        'ticket.form.id': String(PILOT_FORM_ID),
        'ticket.subject': 'Recently unlinked item',
        [CUSTOM_FIELD_PATHS.adoWorkItemId]: '79922',
        [CUSTOM_FIELD_PATHS.adoWorkItemUrl]: 'https://dev.azure.com/example/_workitems/edit/79922'
      },
      requestResponse: {
        ok: true,
        ticketId: 39222,
        linked: false
      }
    })

    const snapshot = await loadTicketSnapshot(client)

    expect(snapshot.summarySource).toBe('backend_empty')
    expect(snapshot.linked).toBe(null)
    expect(client.requestCalls).toHaveLength(1)
    expect(readCustomFieldsCalls(client)).toHaveLength(0)
  })
})
