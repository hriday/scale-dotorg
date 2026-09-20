import { STATUS_LABELS, type Status } from '@/domain/application'

const TONE: Record<Status, string> = {
  submitted: 'bg-scale-blue-pale/40 text-scale-blue-dark',
  under_review: 'bg-scale-blue-pale/40 text-scale-blue-dark',
  info_requested: 'bg-scale-gold-pale text-scale-ink',
  waitlisted: 'bg-scale-gold-pale text-scale-ink',
  accepted: 'bg-green-100 text-green-900',
  confirmed: 'bg-green-600 text-white',
  rejected: 'bg-neutral-200 text-neutral-800',
  withdrawn: 'bg-neutral-200 text-neutral-800',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
