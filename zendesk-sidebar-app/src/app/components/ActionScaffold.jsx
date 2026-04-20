import { useState } from 'react'
import styled from 'styled-components'
import { Button } from '@zendeskgarden/react-buttons'
import { Field, Hint, Input, Label, Message } from '@zendeskgarden/react-forms'
import { LG, SM } from '@zendeskgarden/react-typography'

export default function ActionScaffold({ labels, onCreate, onLink, linked }) {
  const [workItemReference, setWorkItemReference] = useState('')
  const [busy, setBusy] = useState(null) // 'create' | 'link' | null
  const [error, setError] = useState(null)

  const alreadyLinked = Boolean(linked?.workItemId)

  const handleCreate = async () => {
    if (!onCreate) return
    setBusy('create')
    setError(null)
    try {
      await onCreate()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
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
        <Button isPrimary disabled={alreadyLinked || busy !== null} onClick={handleCreate}>
          {busy === 'create' ? labels.creatingLabel : labels.create}
        </Button>
      </ButtonsRow>
      {alreadyLinked && <SM>{labels.alreadyLinkedHint}</SM>}

      <Field>
        <Label>{labels.linkLabel}</Label>
        <Input
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

      {error && <Message validation="error">{error}</Message>}
    </Section>
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
