import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { Button } from '@zendeskgarden/react-buttons'
import { Field, Label, Message, Textarea } from '@zendeskgarden/react-forms'
import { LG, MD, SM } from '@zendeskgarden/react-typography'

const TABS = ['summary', 'activity', 'update']

function tabId(tab) {
  return `ado-workspace-tab-${tab}`
}

function panelId(tab) {
  return `ado-workspace-panel-${tab}`
}

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

function formatValue(value) {
  return value == null || value === '' ? 'Not set' : String(value)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function compactPath(path) {
  if (!path) return null
  const parts = String(path).split('\\').filter(Boolean)
  return parts.slice(-2).join(' / ') || path
}

function formatHealthTone(syncHealth) {
  if (!syncHealth) {
    return HEALTH_TONES.default
  }

  return HEALTH_TONES[syncHealth.replace('ado_sync_health_', '')] || HEALTH_TONES.default
}

function formatHealthLabel(syncHealth) {
  const normalized = syncHealth?.replace('ado_sync_health_', '')
  if (normalized === 'ok') return 'OK'
  if (normalized === 'warning') return 'Warning'
  if (normalized === 'error') return 'Error'
  return formatValue(syncHealth)
}

export async function copyTextToClipboard(text, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard?.writeText) {
    return { ok: false, reason: 'unavailable' }
  }

  try {
    await clipboard.writeText(text)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

function SummaryRows({ linked }) {
  const rows = [
    ['Type', linked.workItemType],
    ['State', linked.state],
    ['Reason', linked.reason],
    ['Owner', linked.assignedTo],
    ['Sprint', linked.sprint || compactPath(linked.iterationPath)],
    ['ETA', formatDate(linked.eta)],
    ['Priority', linked.priority],
    ['Severity', linked.severity],
    ['Area', compactPath(linked.areaPath)],
    ['Product', linked.product],
    ['Client', linked.client],
    ['CRF', linked.crf],
    ['XREF', linked.xref],
  ]

  return (
    <Rows>
      {rows.map(([label, value]) => (
        <InfoRow key={label}>
          <InfoLabel>{label}</InfoLabel>
          <InfoValue>{formatValue(value)}</InfoValue>
        </InfoRow>
      ))}
      {linked.tags?.length ? (
        <InfoRow>
          <InfoLabel>Tags</InfoLabel>
          <TagList>
            {linked.tags.slice(0, 5).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {linked.tags.length > 5 ? <Tag>+{linked.tags.length - 5}</Tag> : null}
          </TagList>
        </InfoRow>
      ) : null}
    </Rows>
  )
}

function ActivityPanel({ linked, labels, onCopyCustomerUpdate }) {
  const recentComments = Array.isArray(linked.recentComments) ? linked.recentComments : []

  return (
    <Panel>
      <Rows>
        <InfoRow>
          <InfoLabel>Last ADO change</InfoLabel>
          <InfoValue>{formatDateTime(linked.changedAt)}</InfoValue>
        </InfoRow>
        <InfoRow>
          <InfoLabel>Last sync</InfoLabel>
          <InfoValue>
            {formatDateTime(linked.lastSyncAt)}
            {linked.lastSyncSource ? ` from ${linked.lastSyncSource}` : ''}
          </InfoValue>
        </InfoRow>
        <InfoRow>
          <InfoLabel>Status detail</InfoLabel>
          <InfoValue>{formatValue(linked.statusDetail)}</InfoValue>
        </InfoRow>
        <InfoRow>
          <InfoLabel>Sync health</InfoLabel>
          <InfoValue>{formatHealthLabel(linked.syncHealth)}</InfoValue>
        </InfoRow>
      </Rows>
      <DiscussionBlock>
        <SM isBold>{labels.recentDiscussionTitle}</SM>
        {recentComments.length ? (
          <DiscussionList>
            {recentComments.map((comment) => (
              <DiscussionItem key={comment.id}>
                <DiscussionMeta>
                  {comment.createdBy || 'Azure DevOps'}
                  {comment.createdAt ? ` · ${formatDateTime(comment.createdAt)}` : ''}
                </DiscussionMeta>
                <DiscussionText>{comment.text || 'No comment text'}</DiscussionText>
              </DiscussionItem>
            ))}
          </DiscussionList>
        ) : (
          <EmptyDiscussion>{labels.recentDiscussionEmpty}</EmptyDiscussion>
        )}
      </DiscussionBlock>
      {linked.customerUpdate ? (
        <CopyBlock>
          <CopyHeader>
            <SM isBold>Customer update</SM>
            <Button size="small" onClick={() => onCopyCustomerUpdate(linked.customerUpdate)}>
              Copy
            </Button>
          </CopyHeader>
          <CopyText>{linked.customerUpdate}</CopyText>
        </CopyBlock>
      ) : null}
    </Panel>
  )
}

function LinkActions({ linked, labels, onUnlink }) {
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)

  const unlink = async () => {
    setBusy('unlink')
    setMessage(null)
    try {
      await onUnlink()
    } catch (err) {
      setMessage({ type: 'error', text: friendlyError(err) })
      setBusy(null)
    }
  }

  return (
    <LinkActionsBlock>
      <LinkActionsRow>
        {linked.workItemUrl ? (
          <OpenLink href={linked.workItemUrl} rel="noreferrer" target="_blank">
            {labels.open}
          </OpenLink>
        ) : null}
        {!confirmingUnlink ? (
          <Button size="small" isDanger disabled={busy !== null} onClick={() => setConfirmingUnlink(true)}>
            {labels.unlinkButton}
          </Button>
        ) : null}
      </LinkActionsRow>
      {confirmingUnlink ? (
        <ConfirmRow>
          <ConfirmText>{labels.unlinkConfirm}</ConfirmText>
          <ButtonRow>
            <Button size="small" isDanger disabled={busy !== null} onClick={unlink}>
              {busy === 'unlink' ? labels.unlinkWorking : labels.unlinkConfirmButton}
            </Button>
            <Button
              size="small"
              disabled={busy !== null}
              onClick={() => {
                setConfirmingUnlink(false)
                setMessage(null)
              }}
            >
              {labels.unlinkCancel}
            </Button>
          </ButtonRow>
        </ConfirmRow>
      ) : null}
      {message ? <Message aria-live="polite" validation={message.type}>{message.text}</Message> : null}
    </LinkActionsBlock>
  )
}

function UpdatePanel({ labels, onAddComment, onRefresh }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)

  const submitComment = async () => {
    if (!comment.trim()) return
    setBusy('comment')
    setMessage(null)
    try {
      await onAddComment(comment.trim())
      setComment('')
      setMessage({ type: 'success', text: labels.commentSuccess })
    } catch (err) {
      setMessage({ type: 'error', text: friendlyError(err) })
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    setBusy('refresh')
    setMessage(null)
    try {
      await onRefresh()
      setMessage({ type: 'success', text: labels.refreshSuccess })
    } catch (err) {
      setMessage({ type: 'error', text: friendlyError(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel>
      <Field>
        <Label>{labels.commentLabel}</Label>
        <Textarea
          name="adoComment"
          autoComplete="off"
          minRows={4}
          maxRows={6}
          onChange={(event) => setComment(event.target.value)}
          placeholder={labels.commentPlaceholder}
          value={comment}
          disabled={busy !== null}
        />
      </Field>
      <ButtonRow>
        <Button isPrimary disabled={!comment.trim() || busy !== null} onClick={submitComment}>
          {busy === 'comment' ? labels.commentWorking : labels.commentButton}
        </Button>
        <Button disabled={busy !== null} onClick={refresh}>
          {busy === 'refresh' ? labels.refreshWorking : labels.refreshButton}
        </Button>
      </ButtonRow>
      {message ? <Message aria-live="polite" validation={message.type}>{message.text}</Message> : null}
    </Panel>
  )
}

function friendlyError(err) {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err.responseJSON?.message) return err.responseJSON.message
  if (err.responseText) return err.responseText
  if (err.message) return err.message
  return 'Action failed'
}

export default function WorkItemWorkspace({ linked, labels, onAddComment, onRefresh, onUnlink }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [copyState, setCopyState] = useState(null)
  const tabRefs = useRef({})
  const copyTimerRef = useRef(null)
  const tone = formatHealthTone(linked.syncHealth)

  const title = linked.title || `ADO #${linked.workItemId}`
  const owner = linked.assignedTo || 'Unassigned'
  const eta = linked.eta ? formatDate(linked.eta) : 'No ETA'

  const focusTab = (tab) => {
    setActiveTab(tab)
    window.requestAnimationFrame(() => {
      tabRefs.current[tab]?.focus()
    })
  }

  const handleTabKeyDown = (event, index) => {
    let nextIndex = null
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }

    if (nextIndex != null) {
      event.preventDefault()
      focusTab(TABS[nextIndex])
    }
  }

  const showCopyState = useCallback((state) => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
    setCopyState(state)
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState(null)
      copyTimerRef.current = null
    }, 1800)
  }, [])

  useEffect(() => () => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const tabContent = useMemo(() => {
    if (activeTab === 'activity') {
      return (
        <ActivityPanel
          linked={linked}
          labels={labels}
          onCopyCustomerUpdate={async (text) => {
            const result = await copyTextToClipboard(text)
            showCopyState({
              type: result.ok ? 'success' : 'error',
              text: result.ok
                ? labels.copied
                : result.reason === 'unavailable'
                  ? labels.copyUnavailable
                  : labels.copyError
            })
          }}
        />
      )
    }

    if (activeTab === 'update') {
      return (
        <UpdatePanel
          labels={labels}
          onAddComment={onAddComment}
          onRefresh={onRefresh}
        />
      )
    }

    return <SummaryRows linked={linked} />
  }, [activeTab, labels, linked, onAddComment, onRefresh, showCopyState])

  return (
    <Card>
      <Topline>
        <WorkItemId>#{linked.workItemId}</WorkItemId>
        <HealthPill $background={tone.background} $color={tone.color}>
          {linked.status || labels.statusUnknown}
        </HealthPill>
      </Topline>
      <Title>{title}</Title>
      <MetaStrip>
        <MetaChip>{owner}</MetaChip>
        <MetaChip>{eta}</MetaChip>
        <MetaChip>{linked.workItemType || labels.typeUnknown}</MetaChip>
      </MetaStrip>
      <LinkActions linked={linked} labels={labels} onUnlink={onUnlink} />

      <Tabs role="tablist" aria-label={labels.tabsLabel}>
        {TABS.map((tab, index) => (
          <TabButton
            key={tab}
            id={tabId(tab)}
            ref={(element) => {
              tabRefs.current[tab] = element
            }}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={panelId(tab)}
            tabIndex={activeTab === tab ? 0 : -1}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {labels.tabs[tab]}
          </TabButton>
        ))}
      </Tabs>

      <TabPanel
        id={panelId(activeTab)}
        role="tabpanel"
        aria-labelledby={tabId(activeTab)}
        tabIndex={0}
      >
        {tabContent}
      </TabPanel>
      {copyState ? <Message aria-live="polite" validation={copyState.type}>{copyState.text}</Message> : null}
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

const Topline = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${(props) => props.theme.space.sm};
`

const WorkItemId = styled(MD)`
  font-weight: 700;
`

const Title = styled(LG)`
  min-width: 0;
  margin: 0;
  color: #17363d;
  line-height: 1.25;
  word-break: break-word;
`

const HealthPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 52%;
  min-height: 1.625rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: ${(props) => props.$background};
  color: ${(props) => props.$color};
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const MetaStrip = styled.div`
  display: flex;
  gap: ${(props) => props.theme.space.xs};
  overflow-x: auto;
  padding-bottom: 0.125rem;
`

const MetaChip = styled.span`
  flex: 0 0 auto;
  max-width: 11rem;
  min-height: 1.5rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: 999px;
  color: #45535f;
  font-size: 0.75rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const LinkActionsBlock = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
  padding-top: ${(props) => props.theme.space.xxs};
`

const LinkActionsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${(props) => props.theme.space.sm};
`

const Tabs = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.md};
  overflow: hidden;
`

const TabButton = styled.button`
  min-height: 2rem;
  border: 0;
  border-right: 1px solid ${(props) => props.theme.palette.grey[300]};
  background: ${(props) => (props.$active ? '#17494d' : '#ffffff')};
  color: ${(props) => (props.$active ? '#ffffff' : '#17363d')};
  cursor: pointer;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;

  &:focus-visible {
    outline: 2px solid #2f6fed;
    outline-offset: -3px;
  }

  &:last-child {
    border-right: 0;
  }
`

const TabPanel = styled.div`
  min-width: 0;

  &:focus-visible {
    outline: 2px solid #2f6fed;
    outline-offset: 2px;
  }
`

const Panel = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.sm};
`

const Rows = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
`

const InfoRow = styled.div`
  display: grid;
  grid-template-columns: minmax(88px, 104px) minmax(0, 1fr);
  gap: ${(props) => props.theme.space.sm};
  align-items: start;
`

const InfoLabel = styled(SM)`
  color: ${(props) => props.theme.palette.grey[700]};
  font-weight: 700;
`

const InfoValue = styled.div`
  min-width: 0;
  color: #17363d;
  font-size: 0.875rem;
  line-height: 1.35;
  word-break: break-word;
`

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${(props) => props.theme.space.xs};
`

const Tag = styled.span`
  min-height: 1.375rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: #eef4f5;
  color: #45535f;
  font-size: 0.75rem;
  font-weight: 600;
`

const CopyBlock = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
  padding: ${(props) => props.theme.space.sm};
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.sm};
  background: #f5f8f8;
`

const CopyHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${(props) => props.theme.space.sm};
`

const CopyText = styled.p`
  margin: 0;
  color: #17363d;
  font-size: 0.875rem;
  line-height: 1.4;
  word-break: break-word;
`

const DiscussionBlock = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
  padding: ${(props) => props.theme.space.sm};
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.sm};
  background: #ffffff;
`

const DiscussionList = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
  max-height: 10rem;
  overflow: auto;
`

const DiscussionItem = styled.article`
  display: grid;
  gap: 0.125rem;
  padding-bottom: ${(props) => props.theme.space.xs};
  border-bottom: 1px solid ${(props) => props.theme.palette.grey[200]};

  &:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
`

const DiscussionMeta = styled(SM)`
  color: ${(props) => props.theme.palette.grey[700]};
  font-weight: 700;
`

const DiscussionText = styled.p`
  margin: 0;
  color: #17363d;
  font-size: 0.8125rem;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
`

const EmptyDiscussion = styled(SM)`
  color: ${(props) => props.theme.palette.grey[700]};
`

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${(props) => props.theme.space.sm};
`

const ConfirmRow = styled.div`
  display: grid;
  gap: ${(props) => props.theme.space.xs};
`

const ConfirmText = styled(SM)`
  color: #8a1f17;
  font-weight: 700;
`

const OpenLink = styled.a`
  color: #17494d;
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid #2f6fed;
    outline-offset: 2px;
  }
`
