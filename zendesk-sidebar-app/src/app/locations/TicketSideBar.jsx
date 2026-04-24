import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
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

export default function TicketSideBar() {
  const client = useClient()
  const i18n = useI18n()
  const { snapshot, loading, error, refresh, applyBackendSummary } = useTicketSnapshot(client)
  const [notice, setNotice] = useState(null)

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
    if (!snapshot) {
      return
    }

    client.invoke(snapshot.isPilotForm ? 'show' : 'hide')
  }, [client, snapshot])

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
