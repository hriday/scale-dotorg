// Pure status vocabulary. Imports no database or mail code, so client
// components can use the labels and transition table without dragging the
// Postgres driver into the browser bundle.
import { applicationStatus } from '@/db/schema'

export type Status = (typeof applicationStatus.enumValues)[number]

/** The states an application can still be moved freely between. */
export const OPEN_STATUSES = ['submitted', 'under_review', 'info_requested', 'waitlisted'] as const

export const TERMINAL_STATUSES = ['rejected', 'withdrawn'] as const

const openTargets = (self: Status): Status[] => OPEN_STATUSES.filter((s) => s !== self) as Status[]

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: [...openTargets('submitted'), 'accepted', 'rejected', 'withdrawn'],
  under_review: [...openTargets('under_review'), 'accepted', 'rejected', 'withdrawn'],
  info_requested: [...openTargets('info_requested'), 'accepted', 'rejected', 'withdrawn'],
  waitlisted: [...openTargets('waitlisted'), 'accepted', 'rejected', 'withdrawn'],
  accepted: ['confirmed', 'rejected', 'withdrawn'],
  confirmed: ['withdrawn'],
  rejected: [],
  withdrawn: [],
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move an application from ${from} to ${to}.`)
  }
}

/** Applicants may only edit while no decision has been made. */
export function isEditable(status: Status): boolean {
  return status === 'submitted' || status === 'under_review' || status === 'info_requested'
}

export const STATUS_LABELS: Record<Status, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'More information needed',
  waitlisted: 'Waitlisted',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
}

/** Decisions that have a default email. Everything else is an internal move. */
export const DECISION_TEMPLATE_KEYS: Partial<Record<Status, string>> = {
  accepted: 'accepted',
  rejected: 'rejected',
  waitlisted: 'waitlisted',
  info_requested: 'info_request',
}
