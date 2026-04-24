import { describe, expect, it, vi } from 'vitest'
import { fetchSummary, postComment, postCreate } from '../src/app/lib/backend.js'

function createClient() {
  return {
    metadata: vi.fn().mockResolvedValue({
      settings: {
        backendBaseUrl: 'https://zendesk-sync.example.com/'
      },
      context: {
        account: {
          url: 'https://jestaissupport.zendesk.com'
        }
      }
    }),
    get: vi.fn().mockResolvedValue({
      currentUser: {
        id: 123456,
        name: 'Maya Analyst',
        email: 'maya.analyst@example.com',
        role: 'agent'
      }
    }),
    request: vi.fn().mockResolvedValue({ ok: true })
  }
}

describe('backend client', () => {
  it('uses secure proxied requests with bounded summary timeout', async () => {
    const client = createClient()

    await fetchSummary(client, 39045)

    expect(client.get).not.toHaveBeenCalled()
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        cors: false,
        autoRetry: false,
        dataType: 'json',
        type: 'GET',
        timeout: 12000,
        url: 'https://zendesk-sync.example.com/app/ado/tickets/39045/summary',
        headers: {
          Authorization: 'Bearer {{jwt.token}}'
        },
        jwt: expect.objectContaining({
          algorithm: 'HS256',
          secret_key: '{{setting.appSharedSecret}}',
          expiry: 60,
          claims: {
            iss: 'https://jestaissupport.zendesk.com',
            aud: 'https://zendesk-sync.example.com'
          }
        })
      })
    )
  })

  it('uses a bounded action timeout for mutations', async () => {
    const client = createClient()

    await postCreate(client, 39045)

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        cors: false,
        autoRetry: false,
        dataType: 'json',
        type: 'POST',
        timeout: 20000,
        url: 'https://zendesk-sync.example.com/app/ado/tickets/39045/create',
        headers: {
          Authorization: 'Bearer {{jwt.token}}'
        }
      })
    )
  })

  it('includes the Zendesk actor in signed mutation claims', async () => {
    const client = createClient()

    await postComment(client, 39045, 'Customer impact confirmed')

    expect(client.get).toHaveBeenCalledWith('currentUser')
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        jwt: expect.objectContaining({
          claims: expect.objectContaining({
            iss: 'https://jestaissupport.zendesk.com',
            aud: 'https://zendesk-sync.example.com',
            sub: '123456',
            zendesk_user_id: '123456',
            zendesk_user_name: 'Maya Analyst',
            zendesk_user_email: 'maya.analyst@example.com',
            zendesk_user_role: 'agent'
          })
        })
      })
    )
  })

  it('posts ADO discussion comments through the signed backend route', async () => {
    const client = createClient()

    await postComment(client, 39045, 'Customer impact confirmed')

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'POST',
        timeout: 20000,
        url: 'https://zendesk-sync.example.com/app/ado/tickets/39045/comment',
        data: JSON.stringify({
          source: 'zendesk_sidebar_app',
          comment: 'Customer impact confirmed'
        })
      })
    )
  })
})
