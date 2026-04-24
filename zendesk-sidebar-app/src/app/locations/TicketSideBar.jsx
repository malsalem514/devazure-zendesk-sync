import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Button } from '@zendeskgarden/react-buttons'
import { Message } from '@zendeskgarden/react-forms'
import { Spinner } from '@zendeskgarden/react-loaders'
import { LG, MD, SM, XL } from '@zendeskgarden/react-typography'
import { useClient } from '../hooks/useClient.js'
import { useI18n } from '../hooks/useI18n.js'
import { useTicketSnapshot } from '../hooks/useTicketSnapshot.js'
import { SIDEBAR_HEIGHT } from '../config.js'
import WorkItemWorkspace from '../components/WorkItemWorkspace.jsx'
import ActionScaffold from '../components/ActionScaffold.jsx'
import { postComment, postCreate, postLink, postUnlink } from '../lib/backend.js'

function hasLinkedItem(linked) {
  return Boolean(linked?.workItemId || linked?.workItemUrl)
}

export const ADO_UPDATE_AVAILABLE_EVENT = 'api_notification.ado_update_available'
const ADO_UPDATE_AVAILABLE_EVENT_ALIASES = [
  ADO_UPDATE_AVAILABLE_EVENT,
  'notification.ado_update_available',
  'ado_update_available'
]

function normalizeNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeString(value) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized === '' ? null : normalized
}

function parseNotificationPayload(payload) {
  const candidate = payload?.body ?? payload
  if (typeof candidate !== 'string') return candidate

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

export function normalizeAdoUpdateNotification(payload) {
  const raw = parseNotificationPayload(payload)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const ticketId = normalizeNumber(raw.ticketId)
  const workItemId = normalizeNumber(raw.workItemId)
  if (!ticketId || !workItemId) return null

  return {
    ticketId,
    workItemId,
    workItemUrl: normalizeString(raw.workItemUrl),
    reason: normalizeString(raw.reason),
    status: normalizeString(raw.status),
    statusDetail: normalizeString(raw.statusDetail),
    commentsSynced: normalizeNumber(raw.commentsSynced) ?? 0,
    occurredAt: normalizeString(raw.occurredAt)
  }
}

function formatAdoUpdateNotice(notice, i18n) {
  if (notice.status && notice.commentsSynced > 0) {
    return i18n.t('ticket_sidebar.ado_notice_status_comments', {
      status: notice.status,
      count: String(notice.commentsSynced)
    })
  }

  if (notice.status) {
    return i18n.t('ticket_sidebar.ado_notice_status', { status: notice.status })
  }

  if (notice.commentsSynced > 0) {
    return i18n.t('ticket_sidebar.ado_notice_comments', {
      count: String(notice.commentsSynced)
    })
  }

  return i18n.t('ticket_sidebar.ado_notice_generic')
}

export default function TicketSideBar() {
  const client = useClient()
  const i18n = useI18n()
  const { snapshot, loading, error, refresh, applyBackendSummary } = useTicketSnapshot(client)
  const [notice, setNotice] = useState(null)
  const [adoNotice, setAdoNotice] = useState(null)
  const [adoNoticeRefreshing, setAdoNoticeRefreshing] = useState(false)
  const ticketIdRef = useRef(null)

  const applyActionResult = useCallback(
    async (result) => {
      if (result?.summary) {
        applyBackendSummary(result.summary)
      } else {
        await refresh()
      }
    },
    [applyBackendSummary, refresh]
  )

  const handleCreate = useCallback(async (handoff) => {
    if (!snapshot?.ticketId) throw new Error('Ticket id not available')
    setNotice(null)
    const result = await postCreate(client, snapshot.ticketId, handoff)
    await applyActionResult(result)
  }, [applyActionResult, client, snapshot?.ticketId])

  const handleLink = useCallback(
    async (workItemReference) => {
      if (!snapshot?.ticketId) throw new Error('Ticket id not available')
      setNotice(null)
      const result = await postLink(client, snapshot.ticketId, workItemReference)
      await applyActionResult(result)
    },
    [applyActionResult, client, snapshot?.ticketId],
  )

  const handleAddComment = useCallback(
    async (comment) => {
      if (!snapshot?.ticketId) throw new Error('Ticket id not available')
      setNotice(null)
      const result = await postComment(client, snapshot.ticketId, comment)
      await applyActionResult(result)
    },
    [applyActionResult, client, snapshot?.ticketId],
  )

  const handleUnlink = useCallback(async () => {
    if (!snapshot?.ticketId) throw new Error('Ticket id not available')
    setNotice(null)
    const result = await postUnlink(client, snapshot.ticketId)
    await applyActionResult(result)
    setNotice({ type: 'success', text: i18n.t('ticket_sidebar.unlink_success') })
  }, [applyActionResult, client, i18n, snapshot?.ticketId])

  const refreshFromAdoNotice = useCallback(async () => {
    setAdoNoticeRefreshing(true)
    try {
      await refresh()
      setAdoNotice(null)
    } finally {
      setAdoNoticeRefreshing(false)
    }
  }, [refresh])

  useEffect(() => {
    let resizeTimer = null
    const resize = () => {
      client.invoke('resize', { width: '100%', height: SIDEBAR_HEIGHT })
    }
    const scheduleResize = () => {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer)
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        resize()
      }, 200)
    }

    resize()
    client.on?.('app.activated', resize)
    window.addEventListener('resize', scheduleResize)

    return () => {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer)
      }
      client.off?.('app.activated', resize)
      window.removeEventListener('resize', scheduleResize)
    }
  }, [client])

  useEffect(() => {
    ticketIdRef.current = snapshot?.ticketId ?? null
  }, [snapshot?.ticketId])

  useEffect(() => {
    if (adoNotice && snapshot?.ticketId && adoNotice.ticketId !== snapshot.ticketId) {
      setAdoNotice(null)
    }
  }, [adoNotice, snapshot?.ticketId])

  useEffect(() => {
    if (!snapshot) {
      return
    }

    client.invoke(snapshot.isPilotForm ? 'show' : 'hide')
  }, [client, snapshot])

  useEffect(() => {
    const handleAdoUpdate = (payload) => {
      const normalized = normalizeAdoUpdateNotification(payload)
      const currentTicketId = ticketIdRef.current
      if (!normalized || !currentTicketId || normalized.ticketId !== currentTicketId) {
        return
      }

      setAdoNotice(normalized)
    }

    ADO_UPDATE_AVAILABLE_EVENT_ALIASES.forEach((eventName) => {
      client.on?.(eventName, handleAdoUpdate)
    })
    return () => {
      ADO_UPDATE_AVAILABLE_EVENT_ALIASES.forEach((eventName) => {
        client.off?.(eventName, handleAdoUpdate)
      })
    }
  }, [client])

  if (loading) {
    return (
      <CenteredState>
        <Spinner size="32" />
        <SM>{i18n.t('ticket_sidebar.loading')}</SM>
      </CenteredState>
    )
  }

  if (error) {
    return (
      <CenteredState>
        <LG isBold>{i18n.t('ticket_sidebar.error_title')}</LG>
      </CenteredState>
    )
  }

  if (!snapshot?.isPilotForm) {
    return null
  }

  const linked = snapshot.linked

  return (
    <Shell>
      <HeaderCard>
        <HeaderTop>
          <XL isBold>{i18n.t('ticket_sidebar.title')}</XL>
          <PilotBadge>{i18n.t('ticket_sidebar.pilot_badge')}</PilotBadge>
        </HeaderTop>
        <MetaList>
          <MetaRow>
            <MetaLabel>{i18n.t('ticket_sidebar.ticket_label')}</MetaLabel>
            <MetaValue>
              #{snapshot.ticketId}
              {snapshot.subject ? ` · ${snapshot.subject}` : ''}
            </MetaValue>
          </MetaRow>
        </MetaList>
      </HeaderCard>

      {adoNotice ? (
        <AdoNotice role="status" aria-live="polite">
          <NoticeText>
            <SM isBold>{i18n.t('ticket_sidebar.ado_notice_title')}</SM>
            <SM>{formatAdoUpdateNotice(adoNotice, i18n)}</SM>
          </NoticeText>
          <NoticeActions>
            <Button
              size="small"
              isPrimary
              disabled={adoNoticeRefreshing}
              onClick={refreshFromAdoNotice}
            >
              {adoNoticeRefreshing
                ? i18n.t('ticket_sidebar.ado_notice_refreshing')
                : i18n.t('ticket_sidebar.ado_notice_refresh')}
            </Button>
            <Button size="small" disabled={adoNoticeRefreshing} onClick={() => setAdoNotice(null)}>
              {i18n.t('ticket_sidebar.ado_notice_dismiss')}
            </Button>
          </NoticeActions>
        </AdoNotice>
      ) : null}

      {hasLinkedItem(linked) ? (
        <WorkItemWorkspace
          labels={{
            open: i18n.t('ticket_sidebar.linked_open'),
            tabsLabel: i18n.t('ticket_sidebar.tabs_label'),
            tabs: {
              summary: i18n.t('ticket_sidebar.tab_summary'),
              activity: i18n.t('ticket_sidebar.tab_activity'),
              update: i18n.t('ticket_sidebar.tab_update')
            },
            statusUnknown: i18n.t('ticket_sidebar.status_unknown'),
            typeUnknown: i18n.t('ticket_sidebar.type_unknown'),
            recentDiscussionTitle: i18n.t('ticket_sidebar.recent_discussion_title'),
            recentDiscussionEmpty: i18n.t('ticket_sidebar.recent_discussion_empty'),
            commentLabel: i18n.t('ticket_sidebar.comment_label'),
            commentPlaceholder: i18n.t('ticket_sidebar.comment_placeholder'),
            commentButton: i18n.t('ticket_sidebar.comment_button'),
            commentWorking: i18n.t('ticket_sidebar.comment_button_working'),
            commentSuccess: i18n.t('ticket_sidebar.comment_success'),
            refreshButton: i18n.t('ticket_sidebar.refresh_button'),
            refreshWorking: i18n.t('ticket_sidebar.refresh_button_working'),
            refreshSuccess: i18n.t('ticket_sidebar.refresh_success'),
            copied: i18n.t('ticket_sidebar.copy_success'),
            copyUnavailable: i18n.t('ticket_sidebar.copy_unavailable'),
            copyError: i18n.t('ticket_sidebar.copy_error'),
            unlinkButton: i18n.t('ticket_sidebar.unlink_button'),
            unlinkConfirm: i18n.t('ticket_sidebar.unlink_confirm'),
            unlinkConfirmButton: i18n.t('ticket_sidebar.unlink_confirm_button'),
            unlinkCancel: i18n.t('ticket_sidebar.unlink_cancel'),
            unlinkWorking: i18n.t('ticket_sidebar.unlink_button_working')
          }}
          linked={linked}
          onAddComment={handleAddComment}
          onRefresh={refresh}
          onUnlink={handleUnlink}
        />
      ) : (
        <EmptyStateCard>
          <LG isBold>{i18n.t('ticket_sidebar.linked_empty_title')}</LG>
          <MD>{i18n.t('ticket_sidebar.linked_empty_body')}</MD>
          {notice ? <Message aria-live="polite" validation={notice.type}>{notice.text}</Message> : null}
        </EmptyStateCard>
      )}

      {!hasLinkedItem(linked) ? (
        <ActionScaffold
          linked={linked}
          onCreate={handleCreate}
          onLink={handleLink}
          labels={{
            title: i18n.t('ticket_sidebar.actions_title'),
            create: i18n.t('ticket_sidebar.create_button'),
            creatingLabel: i18n.t('ticket_sidebar.create_button_working') || 'Creating…',
            createFormTitle: i18n.t('ticket_sidebar.create_form_title'),
            reproStepsLabel: i18n.t('ticket_sidebar.repro_steps_label'),
            systemInfoLabel: i18n.t('ticket_sidebar.system_info_label'),
            finalResultsLabel: i18n.t('ticket_sidebar.final_results_label'),
            acceptanceCriteriaLabel: i18n.t('ticket_sidebar.acceptance_criteria_label'),
            createSubmit: i18n.t('ticket_sidebar.create_submit_button'),
            createCancel: i18n.t('ticket_sidebar.create_cancel_button'),
            linkLabel: i18n.t('ticket_sidebar.link_label'),
            linkPlaceholder: i18n.t('ticket_sidebar.link_placeholder'),
            link: i18n.t('ticket_sidebar.link_button'),
            linkingLabel: i18n.t('ticket_sidebar.link_button_working') || 'Linking…',
            alreadyLinkedHint: i18n.t('ticket_sidebar.already_linked_hint') || 'This ticket is already linked.',
            hint: i18n.t('ticket_sidebar.actions_hint')
          }}
        />
      ) : null}
    </Shell>
  )
}

const Shell = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.md};
  padding: ${(props) => props.theme.space.md};
`

const CenteredState = styled.div`
  min-height: 320px;
  display: grid;
  gap: ${(props) => props.theme.space.sm};
  place-content: center;
  padding: ${(props) => props.theme.space.lg};
  text-align: center;
`

const CardBase = styled.section`
  display: grid;
  gap: ${(props) => props.theme.space.sm};
  padding: ${(props) => props.theme.space.md};
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.md};
  background: #ffffff;
`

const HeaderCard = styled(CardBase)`
  background: linear-gradient(180deg, #ffffff 0%, #f7faf9 100%);
`

const AdoNotice = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${(props) => props.theme.space.sm};
  align-items: center;
  padding: ${(props) => props.theme.space.sm};
  border: 1px solid #9bd0d9;
  border-radius: ${(props) => props.theme.borderRadii.sm};
  background: #edf7f9;
  color: #17363d;

  @media (max-width: 320px) {
    grid-template-columns: 1fr;
  }
`

const NoticeText = styled.div`
  display: grid;
  gap: 0.125rem;
  min-width: 0;
`

const NoticeActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${(props) => props.theme.space.xs};
  justify-content: flex-end;
`

const HeaderTop = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: ${(props) => props.theme.space.sm};
`

const PilotBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 999px;
  background: #dff7e4;
  color: #116149;
  font-size: 0.8125rem;
  font-weight: 700;
`

const MetaList = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
`

const MetaRow = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xxs};
`

const MetaLabel = styled(SM)`
  color: ${(props) => props.theme.palette.grey[700]};
  font-weight: 600;
`

const MetaValue = styled(MD)`
  color: #17363d;
  word-break: break-word;
`

const EmptyStateCard = styled(CardBase)``
