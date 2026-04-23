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
import { postCreate, postLink, postNote, postUnlink } from '../lib/backend.js'

function hasLinkedItem(linked) {
  return Boolean(linked?.workItemId || linked?.workItemUrl)
}

export default function TicketSideBar() {
  const client = useClient()
  const i18n = useI18n()
  const { snapshot, loading, error, refresh } = useTicketSnapshot(client)
  const [notice, setNotice] = useState(null)

  const handleCreate = useCallback(async () => {
    if (!snapshot?.ticketId) throw new Error('Ticket id not available')
    setNotice(null)
    await postCreate(client, snapshot.ticketId)
    await refresh()
  }, [client, snapshot?.ticketId, refresh])

  const handleLink = useCallback(
    async (workItemReference) => {
      if (!snapshot?.ticketId) throw new Error('Ticket id not available')
      setNotice(null)
      await postLink(client, snapshot.ticketId, workItemReference)
      await refresh()
    },
    [client, snapshot?.ticketId, refresh],
  )

  const handleAddNote = useCallback(
    async (note) => {
      if (!snapshot?.ticketId) throw new Error('Ticket id not available')
      setNotice(null)
      await postNote(client, snapshot.ticketId, note)
      await refresh()
    },
    [client, snapshot?.ticketId, refresh],
  )

  const handleUnlink = useCallback(async () => {
    if (!snapshot?.ticketId) throw new Error('Ticket id not available')
    setNotice(null)
    await postUnlink(client, snapshot.ticketId)
    await refresh()
    setNotice({ type: 'success', text: i18n.t('ticket_sidebar.unlink_success') })
  }, [client, i18n, snapshot?.ticketId, refresh])

  useEffect(() => {
    client.invoke('resize', { width: '100%', height: SIDEBAR_HEIGHT })
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
            noteLabel: i18n.t('ticket_sidebar.note_label'),
            notePlaceholder: i18n.t('ticket_sidebar.note_placeholder'),
            noteButton: i18n.t('ticket_sidebar.note_button'),
            noteWorking: i18n.t('ticket_sidebar.note_button_working'),
            noteSuccess: i18n.t('ticket_sidebar.note_success'),
            refreshButton: i18n.t('ticket_sidebar.refresh_button'),
            refreshWorking: i18n.t('ticket_sidebar.refresh_button_working'),
            refreshSuccess: i18n.t('ticket_sidebar.refresh_success'),
            copied: i18n.t('ticket_sidebar.copy_success'),
            unlinkButton: i18n.t('ticket_sidebar.unlink_button'),
            unlinkConfirm: i18n.t('ticket_sidebar.unlink_confirm'),
            unlinkConfirmButton: i18n.t('ticket_sidebar.unlink_confirm_button'),
            unlinkCancel: i18n.t('ticket_sidebar.unlink_cancel'),
            unlinkWorking: i18n.t('ticket_sidebar.unlink_button_working')
          }}
          linked={linked}
          onAddNote={handleAddNote}
          onRefresh={refresh}
          onUnlink={handleUnlink}
        />
      ) : (
        <EmptyStateCard>
          <LG isBold>{i18n.t('ticket_sidebar.linked_empty_title')}</LG>
          <MD>{i18n.t('ticket_sidebar.linked_empty_body')}</MD>
          {notice ? <Message validation={notice.type}>{notice.text}</Message> : null}
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
            creatingLabel: i18n.t('ticket_sidebar.create_button_working') || 'Creating...',
            linkLabel: i18n.t('ticket_sidebar.link_label'),
            linkPlaceholder: i18n.t('ticket_sidebar.link_placeholder'),
            link: i18n.t('ticket_sidebar.link_button'),
            linkingLabel: i18n.t('ticket_sidebar.link_button_working') || 'Linking...',
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
