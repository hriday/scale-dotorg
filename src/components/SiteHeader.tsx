import Link from 'next/link'
import { COPY } from '@/copy'
import { EVENT } from '@/event'

export function SiteHeader() {
  return (
    <header className="bg-scale-ink text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          {/* A plain img: next/image refuses to optimize SVG without dangerouslyAllowSVG. */}
          <img src="/logo.svg" alt="SCaLE" width={36} height={40} />
          <span className="text-lg font-semibold">
            {COPY.programName}
            <span className="ml-2 font-normal text-scale-blue-pale">{EVENT.name}</span>
          </span>
        </Link>
      </div>
    </header>
  )
}
