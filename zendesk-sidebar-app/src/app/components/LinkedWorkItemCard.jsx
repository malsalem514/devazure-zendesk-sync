import styled from 'styled-components'
import { LG, MD, SM } from '@zendeskgarden/react-typography'

const HEALTH_TONES = {
  ok: {
    background: '#dff7e4',
    color: '#116149'
  },
  warning: {
    background: '#fff1db',
    color: '#8c4a00'
  },
  error: {
    background: '#ffe5e5',
    color: '#8a1f17'
  },
  default: {
    background: '#e9edef',
    color: '#45535f'
  }
}

function formatHealthTone(syncHealth) {
  if (!syncHealth) {
    return HEALTH_TONES.default
  }

  return HEALTH_TONES[syncHealth] || HEALTH_TONES.default
}

export default function LinkedWorkItemCard({ linked, labels }) {
  const tone = formatHealthTone(linked.syncHealth)

  return (
    <Card>
      <LG isBold>{labels.title}</LG>
      <HeaderRow>
        <WorkItemId>#{linked.workItemId}</WorkItemId>
        {linked.workItemUrl ? (
          <OpenLink href={linked.workItemUrl} rel="noreferrer" target="_blank">
            {labels.open}
          </OpenLink>
        ) : null}
      </HeaderRow>
      <DetailsList>
        <DetailRow>
          <DetailLabel>{labels.status}</DetailLabel>
          <DetailValue>{linked.status || '—'}</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>{labels.detail}</DetailLabel>
          <DetailValue>{linked.statusDetail || '—'}</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>{labels.sprint}</DetailLabel>
          <DetailValue>{linked.sprint || '—'}</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>{labels.eta}</DetailLabel>
          <DetailValue>{linked.eta || '—'}</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>{labels.syncHealth}</DetailLabel>
          <HealthPill $background={tone.background} $color={tone.color}>
            {linked.syncHealth || 'unknown'}
          </HealthPill>
        </DetailRow>
        <DetailRow>
          <DetailLabel>{labels.lastSync}</DetailLabel>
          <DetailValue>
            <SM>{linked.lastSyncAt || '—'}</SM>
          </DetailValue>
        </DetailRow>
      </DetailsList>
    </Card>
  )
}

const Card = styled.section`
  display: grid;
  gap: ${(props) => props.theme.space.sm};
  padding: ${(props) => props.theme.space.md};
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.md};
  background: #ffffff;
`

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${(props) => props.theme.space.sm};
`

const WorkItemId = styled(MD)`
  font-weight: 700;
`

const OpenLink = styled.a`
  color: #17494d;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`

const DetailsList = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
`

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: minmax(108px, 132px) minmax(0, 1fr);
  gap: ${(props) => props.theme.space.sm};
  align-items: start;
`

const DetailLabel = styled(SM)`
  color: ${(props) => props.theme.palette.grey[700]};
  font-weight: 600;
`

const DetailValue = styled.div`
  min-width: 0;
  color: #17363d;
  font-size: 0.875rem;
  line-height: 1.4;
  word-break: break-word;
`

const HealthPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 999px;
  background: ${(props) => props.$background};
  color: ${(props) => props.$color};
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: lowercase;
`
