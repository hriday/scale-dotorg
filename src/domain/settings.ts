export type WindowState = 'before' | 'open' | 'closed'

export interface ApplicationWindow {
  applicationsOpenAt: Date
  applicationsCloseAt: Date
}

export function windowState(settings: ApplicationWindow, now: Date): WindowState {
  if (now < settings.applicationsOpenAt) return 'before'
  if (now > settings.applicationsCloseAt) return 'closed'
  return 'open'
}

export function formatFee(cents: number): string {
  const dollars = cents / 100
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const DEFAULT_TERMS_TEXT = `SCaLE provides community booth space, power, and basic booth furnishings at no cost to your organization. In accepting a booth you agree to staff it during all expo floor hours and to notify us as early as possible if your plans change.

Booth space is limited and every booth we hold is one another project cannot have. If you cancel fewer than 30 days before the event, or do not occupy your booth during the show, a late cancellation fee of {{fee}} applies. Cancellations must be made in writing to dotorgs@socallinuxexpo.org.

We would always rather hear from you early than charge this fee. Tell us as soon as you know.`
