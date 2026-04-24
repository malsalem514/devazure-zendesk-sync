import { useState } from 'react'
import styled from 'styled-components'
import { Button } from '@zendeskgarden/react-buttons'
import { Field, Hint, Input, Label, Message, Textarea } from '@zendeskgarden/react-forms'
import { LG, SM } from '@zendeskgarden/react-typography'

const EMPTY_HANDOFF = {
  reproSteps: '',
  systemInfo: '',
  finalResults: '',
  acceptanceCriteria: ''
}

export default function ActionScaffold({ labels, onCreate, onLink, linked }) {
  const [workItemReference, setWorkItemReference] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [handoff, setHandoff] = useState(EMPTY_HANDOFF)
  const [busy, setBusy] = useState(null) // 'create' | 'link' | null
  const [error, setError] = useState(null)

  const alreadyLinked = Boolean(linked?.workItemId)

  const handleOpenCreate = () => {
    setError(null)
    setShowCreateForm(true)
  }

  const handleCreate = async () => {
    if (!onCreate) return
    setBusy('create')
    setError(null)
    try {
      await onCreate(normalizeHandoff(handoff))
      setHandoff(EMPTY_HANDOFF)
      setShowCreateForm(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  const handleCancelCreate = () => {
    if (busy !== null) return
    setShowCreateForm(false)
    setHandoff(EMPTY_HANDOFF)
  }

  const updateHandoff = (field) => (event) => {
    setHandoff((current) => ({ ...current, [field]: event.target.value }))
  }

  const handleLink = async () => {
    if (!onLink || !workItemReference.trim()) return
    setBusy('link')
    setError(null)
    try {
      await onLink(workItemReference.trim())
      setWorkItemReference('')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section>
      <LG isBold>{labels.title}</LG>
      <ButtonsRow>
        <Button isPrimary disabled={alreadyLinked || busy !== null} onClick={handleOpenCreate}>
          {labels.create}
        </Button>
      </ButtonsRow>
      {alreadyLinked && <SM>{labels.alreadyLinkedHint}</SM>}
      {showCreateForm && !alreadyLinked ? (
        <CreateForm onSubmit={(event) => { event.preventDefault(); handleCreate() }}>
          <SM isBold>{labels.createFormTitle}</SM>
          <CompactField>
            <Label>{labels.reproStepsLabel}</Label>
            <CompactTextarea
              name="adoReproSteps"
              value={handoff.reproSteps}
              onChange={updateHandoff('reproSteps')}
              disabled={busy !== null}
              rows={3}
            />
          </CompactField>
          <CompactField>
            <Label>{labels.systemInfoLabel}</Label>
            <CompactTextarea
              name="adoSystemInfo"
              value={handoff.systemInfo}
              onChange={updateHandoff('systemInfo')}
              disabled={busy !== null}
              rows={2}
            />
          </CompactField>
          <CompactField>
            <Label>{labels.finalResultsLabel}</Label>
            <CompactTextarea
              name="adoFinalResults"
              value={handoff.finalResults}
              onChange={updateHandoff('finalResults')}
              disabled={busy !== null}
              rows={2}
            />
          </CompactField>
          <CompactField>
            <Label>{labels.acceptanceCriteriaLabel}</Label>
            <CompactTextarea
              name="adoAcceptanceCriteria"
              value={handoff.acceptanceCriteria}
              onChange={updateHandoff('acceptanceCriteria')}
              disabled={busy !== null}
              rows={2}
            />
          </CompactField>
          <ButtonsRow>
            <Button isPrimary type="submit" disabled={busy !== null}>
              {busy === 'create' ? labels.creatingLabel : labels.createSubmit}
            </Button>
            <Button type="button" isBasic disabled={busy !== null} onClick={handleCancelCreate}>
              {labels.createCancel}
            </Button>
          </ButtonsRow>
        </CreateForm>
      ) : null}

      <Field>
        <Label>{labels.linkLabel}</Label>
        <Input
          name="adoWorkItemReference"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setWorkItemReference(event.target.value)}
          placeholder={labels.linkPlaceholder}
          value={workItemReference}
          disabled={alreadyLinked || busy !== null}
        />
        <Hint>{labels.hint}</Hint>
      </Field>
      <ButtonsRow>
        <Button disabled={!workItemReference.trim() || alreadyLinked || busy !== null} onClick={handleLink}>
          {busy === 'link' ? labels.linkingLabel : labels.link}
        </Button>
      </ButtonsRow>

      {error && <Message aria-live="polite" validation="error">{error}</Message>}
    </Section>
  )
}

function normalizeHandoff(handoff) {
  return Object.fromEntries(
    Object.entries(handoff)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])
      .filter(([, value]) => value !== '')
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

const Section = styled.section`
  display: grid;
  gap: ${(props) => props.theme.space.sm};
  padding: ${(props) => props.theme.space.md};
  border: 1px solid ${(props) => props.theme.palette.grey[300]};
  border-radius: ${(props) => props.theme.borderRadii.md};
  background: #ffffff;
`

const ButtonsRow = styled.div`
  display: flex;
  gap: ${(props) => props.theme.space.sm};
  flex-wrap: wrap;
`

const CreateForm = styled.form`
  display: grid;
  gap: ${(props) => props.theme.space.sm};
  padding-block: ${(props) => props.theme.space.xs} ${(props) => props.theme.space.sm};
  border-block: 1px solid ${(props) => props.theme.palette.grey[200]};
`

const CompactField = styled(Field)`
  margin-bottom: 0;
`

const CompactTextarea = styled(Textarea)`
  min-height: 4.5rem;
  resize: vertical;
`
