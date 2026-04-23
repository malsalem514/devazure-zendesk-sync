/**
 * Backend client for the sidebar app.
 *
 * Calls go through Zendesk's proxy using `client.request({ secure: true })`:
 *   - The URL template below is substituted server-side with the app's secure
 *     settings (`backendBaseUrl`).
 *   - `backendHost` mirrors the URL host in manifest `domainWhitelist` so
 *     secure requests cannot be rerouted to an arbitrary domain.
 *   - Zendesk signs the request with `appSharedSecret` (HS256 JWT in
 *     Authorization: Bearer), which the backend verifies via
 *     src/lib/zaf-auth.ts -> verifyAuthorizationHeader.
 *
 * None of the secrets live in the iframe bundle — they stay in Zendesk secure
 * settings and in the backend `.env`.
 */

const BASE_TEMPLATE = '{{setting.backendBaseUrl}}/app/ado/tickets'

async function appRequest(client, options) {
  return client.request({
    secure: true,
    contentType: 'application/json',
    cors: false,
    ...options,
  })
}

export async function fetchSummary(client, ticketId) {
  return appRequest(client, {
    url: `${BASE_TEMPLATE}/${ticketId}/summary`,
    type: 'GET',
  })
}

export async function postCreate(client, ticketId) {
  return appRequest(client, {
    url: `${BASE_TEMPLATE}/${ticketId}/create`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app' }),
  })
}

export async function postLink(client, ticketId, workItemReference) {
  return appRequest(client, {
    url: `${BASE_TEMPLATE}/${ticketId}/link`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app', workItemReference }),
  })
}

export async function postNote(client, ticketId, note) {
  return appRequest(client, {
    url: `${BASE_TEMPLATE}/${ticketId}/note`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app', note }),
  })
}
