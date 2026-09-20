import Link from 'next/link'

type Variant = 'primary' | 'secondary'

const styles: Record<Variant, string> = {
  primary: 'bg-scale-blue text-white hover:bg-scale-blue-hover',
  secondary: 'bg-white text-scale-blue border border-scale-blue hover:bg-scale-blue-pale/30',
}

const base =
  'inline-block rounded px-5 py-3 text-base font-semibold transition-colors disabled:opacity-60'

export function Button({
  href,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: {
  href?: string
  variant?: Variant
  className?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `${base} ${styles[variant]} ${className}`
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
