import { describe, expect, it } from 'vitest'
import {
  DECISION_TEMPLATE_KEYS,
  STATUS_LABELS,
  TRANSITIONS,
  assertTransition,
  canTransition,
  isEditable,
  type Status,
} from '@/domain/application'

const ALL: Status[] = [
  'submitted', 'under_review', 'info_requested', 'waitlisted',
  'accepted', 'confirmed', 'rejected', 'withdrawn',
]

describe('TRANSITIONS', () => {
  it('covers every status', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).toBeDefined()
  })
  it('only ever targets a real status', () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) expect(ALL).toContain(target)
    }
  })
  it('never lets a status transition to itself', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).not.toContain(status)
  })
})

describe('canTransition', () => {
  it('lets an admin accept straight from submitted without passing through review', () => {
    expect(canTransition('submitted', 'accepted')).toBe(true)
  })
  it('lets the four open states reach each other', () => {
    const open: Status[] = ['submitted', 'under_review', 'info_requested', 'waitlisted']
    for (const from of open) for (const to of open) {
      if (from !== to) expect(canTransition(from, to)).toBe(true)
    }
  })
  it('allows accepted to be confirmed', () => {
    expect(canTransition('accepted', 'confirmed')).toBe(true)
  })
  it('does not allow confirmed to go back to accepted', () => {
    expect(canTransition('confirmed', 'accepted')).toBe(false)
  })
  it('does not allow an accepted application to return to review', () => {
    expect(canTransition('accepted', 'under_review')).toBe(false)
  })
  it('treats rejected as terminal', () => expect(TRANSITIONS.rejected).toHaveLength(0))
  it('treats withdrawn as terminal', () => expect(TRANSITIONS.withdrawn).toHaveLength(0))
  it('lets every pre-confirmed state be withdrawn', () => {
    for (const s of ['submitted','under_review','info_requested','waitlisted','accepted'] as Status[]) {
      expect(canTransition(s, 'withdrawn')).toBe(true)
    }
  })
  it('lets a confirmed booth be withdrawn', () => {
    expect(canTransition('confirmed', 'withdrawn')).toBe(true)
  })
})

describe('assertTransition', () => {
  it('passes a legal move', () => expect(() => assertTransition('submitted', 'accepted')).not.toThrow())
  it('names both states when refusing', () => {
    expect(() => assertTransition('rejected', 'accepted')).toThrow(/rejected.*accepted/)
  })
})

describe('isEditable', () => {
  it('allows editing while the application is still open', () => {
    expect(isEditable('submitted')).toBe(true)
    expect(isEditable('under_review')).toBe(true)
    expect(isEditable('info_requested')).toBe(true)
  })
  it('refuses editing once a decision is made', () => {
    expect(isEditable('accepted')).toBe(false)
    expect(isEditable('waitlisted')).toBe(false)
    expect(isEditable('rejected')).toBe(false)
    expect(isEditable('withdrawn')).toBe(false)
  })
})

describe('labels and templates', () => {
  it('labels every status for display', () => {
    for (const status of ALL) expect(STATUS_LABELS[status]).toBeTruthy()
  })
  it('maps the four notifying decisions to templates', () => {
    expect(DECISION_TEMPLATE_KEYS.accepted).toBe('accepted')
    expect(DECISION_TEMPLATE_KEYS.rejected).toBe('rejected')
    expect(DECISION_TEMPLATE_KEYS.waitlisted).toBe('waitlisted')
    expect(DECISION_TEMPLATE_KEYS.info_requested).toBe('info_request')
  })
  it('has no template for internal-only moves', () => {
    expect(DECISION_TEMPLATE_KEYS.under_review).toBeUndefined()
    expect(DECISION_TEMPLATE_KEYS.confirmed).toBeUndefined()
  })
})
