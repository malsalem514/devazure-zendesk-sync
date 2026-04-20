import { useState } from 'react'
import styled from 'styled-components'
import { Button } from '@zendeskgarden/react-buttons'
import { Field, Hint, Input, Label } from '@zendeskgarden/react-forms'
import { LG } from '@zendeskgarden/react-typography'

export default function ActionScaffold({ labels }) {
  const [workItemReference, setWorkItemReference] = useState('')

  return (
    <Section>
      <LG isBold>{labels.title}</LG>
      <ButtonsRow>
        <Button isPrimary disabled>
          {labels.create}
        </Button>
      </ButtonsRow>
      <Field>
        <Label>{labels.linkLabel}</Label>
        <Input
          onChange={(event) => setWorkItemReference(event.target.value)}
          placeholder={labels.linkPlaceholder}
          value={workItemReference}
        />
        <Hint>{labels.hint}</Hint>
      </Field>
      <ButtonsRow>
        <Button disabled={!workItemReference}>
          {labels.link}
        </Button>
      </ButtonsRow>
    </Section>
  )
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
