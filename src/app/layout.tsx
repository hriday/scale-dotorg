import type { Metadata } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import './globals.css'

export const metadata: Metadata = {
  title: `${COPY.programName} — ${EVENT.name}`,
  description: COPY.tagline,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
