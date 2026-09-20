export function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string
  name: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <label htmlFor={name} className="block text-base font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-sm text-scale-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${name}-error`} className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded border border-scale-rule px-3 py-2 text-base focus:border-scale-blue focus:outline-none'
