import { describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '../src/app/components/WorkItemWorkspace.jsx'

describe('copyTextToClipboard', () => {
  it('writes text when Clipboard API is available', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }

    await expect(copyTextToClipboard('Customer update', clipboard)).resolves.toEqual({ ok: true })
    expect(clipboard.writeText).toHaveBeenCalledWith('Customer update')
  })

  it('reports unavailable clipboard support', async () => {
    await expect(copyTextToClipboard('Customer update', null)).resolves.toEqual({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('reports write failures without throwing', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('denied')) }

    await expect(copyTextToClipboard('Customer update', clipboard)).resolves.toEqual({
      ok: false,
      reason: 'failed'
    })
  })
})
