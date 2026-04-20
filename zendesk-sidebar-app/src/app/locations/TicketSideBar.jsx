import { useEffect } from 'react'
import styled from 'styled-components'
import { Spinner } from '@zendeskgarden/react-loaders'
import { LG, MD, SM, XL } from '@zendeskgarden/react-typography'
import { useClient } from '../hooks/useClient.js'
import { useI18n } from '../hooks/useI18n.js'
import { useTicketSnapshot } from '../hooks/useTicketSnapshot.js'
import { SIDEBAR_HEIGHT } from '../config.js'
import LinkedWorkItemCard from '../components/LinkedWorkItemCard.jsx'
import ActionScaffold from '../components/ActionScaffold.jsx'

function hasLinkedItem(linked) {
  return Boolean(linked?.workItemId || linked?.workItemUrl)
}

export default function TicketSideBar() {
  const client = useClient()
  const i18n = useI18n()
  const { snapshot, loading, error } = useTicketSnapshot(client)

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

      <NoticeCard>
        <LG isBold>{i18n.t('ticket_sidebar.scaffold_title')}</LG>
        <MD>{i18n.t('ticket_sidebar.scaffold_body')}</MD>
      </NoticeCard>

      {hasLinkedItem(linked) ? (
        <LinkedWorkItemCard
          labels={{
            title: i18n.t('ticket_sidebar.linked_title'),
            open: i18n.t('ticket_sidebar.linked_open'),
            status: i18n.t('ticket_sidebar.status_label'),
            detail: i18n.t('ticket_sidebar.detail_label'),
            sprint: i18n.t('ticket_sidebar.sprint_label'),
            eta: i18n.t('ticket_sidebar.eta_label'),
            syncHealth: i18n.t('ticket_sidebar.sync_health_label'),
            lastSync: i18n.t('ticket_sidebar.last_sync_label')
          }}
          linked={linked}
        />
      ) : (
        <EmptyStateCard>
          <LG isBold>{i18n.t('ticket_sidebar.linked_empty_title')}</LG>
          <MD>{i18n.t('ticket_sidebar.linked_empty_body')}</MD>
        </EmptyStateCard>
      )}

      <ActionScaffold
        labels={{
          title: i18n.t('ticket_sidebar.actions_title'),
          create: i18n.t('ticket_sidebar.create_button'),
          linkLabel: i18n.t('ticket_sidebar.link_label'),
          linkPlaceholder: i18n.t('ticket_sidebar.link_placeholder'),
          link: i18n.t('ticket_sidebar.link_button'),
          hint: i18n.t('ticket_sidebar.actions_hint')
        }}
      />
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

const NoticeCard = styled(CardBase)`
  background: #f5f8f8;
`

const EmptyStateCard = styled(CardBase)``
