/**
 * Backend client for the sidebar app.
 *
 * Calls go through Zendesk's proxy using `client.request({ secure: true })`:
 *   - The non-secret backend URL comes from installation metadata and is
 *     constrained by manifest `domainWhitelist`.
 *   - Zendesk signs a short-lived HS256 JWT using the secure `appSharedSecret`
 *     setting and inserts it outside the iframe bundle.
 *   - The backend verifies Authorization: Bearer {{jwt.token}} via
 *     src/lib/zaf-auth.ts -> verifyAuthorizationHeader.
 *
 * None of the secrets live in the iframe bundle — they stay in Zendesk secure
 * settings and in the backend `.env`.
 */

const SUMMARY_TIMEOUT_MS = 12_000
const ACTION_TIMEOUT_MS = 20_000
const JWT_EXPIRY_SECONDS = 60

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function normalizeHttpsOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

function resolveZendeskOrigin(metadata) {
  const accountUrl = normalizeHttpsOrigin(metadata?.context?.account?.url)
  if (accountUrl) return accountUrl

  const subdomain = metadata?.context?.account?.subdomain
  if (typeof subdomain === 'string' && /^[a-z0-9-]+$/i.test(subdomain)) {
    return `https://${subdomain}.zendesk.com`
  }

  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return normalizeHttpsOrigin(new URL(window.location.href).searchParams.get('origin'))
    } catch {
      return null
    }
  }

  return null
}

async function resolveBackendRequestContext(client) {
  const metadata = await client.metadata()
  const rawBaseUrl = metadata?.settings?.backendBaseUrl
  if (typeof rawBaseUrl !== 'string' || rawBaseUrl.trim() === '') {
    throw new Error('Missing backendBaseUrl installation setting.')
  }

  let baseUrl
  try {
    baseUrl = new URL(rawBaseUrl.trim())
  } catch {
    throw new Error('Invalid backendBaseUrl installation setting.')
  }

  if (baseUrl.protocol !== 'https:') {
    throw new Error('backendBaseUrl must use https.')
  }

  const zendeskOrigin = resolveZendeskOrigin(metadata)
  if (!zendeskOrigin) {
    throw new Error('Unable to determine Zendesk origin for signed app request.')
  }

  return {
    baseUrl: trimTrailingSlash(baseUrl.toString()),
    zendeskOrigin,
  }
}

async function appRequest(client, options) {
  const { baseUrl, zendeskOrigin } = await resolveBackendRequestContext(client)
  const { path, ...requestOptions } = options

  return client.request({
    secure: true,
    contentType: 'application/json',
    cors: false,
    dataType: 'json',
    autoRetry: false,
    timeout: ACTION_TIMEOUT_MS,
    headers: {
      Authorization: 'Bearer {{jwt.token}}',
    },
    jwt: {
      algorithm: 'HS256',
      secret_key: '{{setting.appSharedSecret}}',
      expiry: JWT_EXPIRY_SECONDS,
      claims: {
        iss: zendeskOrigin,
        aud: baseUrl,
      },
    },
    ...requestOptions,
    url: `${baseUrl}${path}`,
  })
}

export async function fetchSummary(client, ticketId) {
  return appRequest(client, {
    path: `/app/ado/tickets/${ticketId}/summary`,
    type: 'GET',
    timeout: SUMMARY_TIMEOUT_MS,
  })
}

export async function postCreate(client, ticketId) {
  return appRequest(client, {
    path: `/app/ado/tickets/${ticketId}/create`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app' }),
  })
}

export async function postLink(client, ticketId, workItemReference) {
  return appRequest(client, {
    path: `/app/ado/tickets/${ticketId}/link`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app', workItemReference }),
  })
}

export async function postUnlink(client, ticketId) {
  return appRequest(client, {
    path: `/app/ado/tickets/${ticketId}/unlink`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app' }),
  })
}

export async function postComment(client, ticketId, comment) {
  return appRequest(client, {
    path: `/app/ado/tickets/${ticketId}/comment`,
    type: 'POST',
    data: JSON.stringify({ source: 'zendesk_sidebar_app', comment }),
  })
}
