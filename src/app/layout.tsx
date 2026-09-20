import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Community Booths — SCaLE 24x',
  description: 'Apply for a community booth at the Southern California Linux Expo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
