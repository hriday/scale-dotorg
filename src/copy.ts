import { EVENT } from './event'

export const COPY = {
  programName: 'Community Booths',
  tagline: `Free booth space for open source projects and community groups at ${EVENT.name}.`,
  intro: [
    'One thing that makes SCaLE special is that we mix open source projects and community groups in alongside our commercial sponsors on the expo floor. Your favorite projects sit right next to the companies that depend on them.',
    'Every year we set aside booth space for open source projects and communities to showcase their work, meet their existing community, and find new users and contributors.',
  ],
  provides: [
    'Booth space on the expo floor',
    'Power to the booth',
    'Basic booth furnishings',
    'No cost to your project',
  ],
  expects: [
    'Someone at your booth during all expo floor hours',
    'Something worth an attendee’s time — a demo, a conversation, something to learn',
    'A short write-up of what you plan to show and why it matters',
    'Text for your booth sign and a logo we can print',
  ],
} as const
