import { closeDb } from './client'
import { dispatchPending } from '@/services/mail/outbox'

async function main() {
  const result = await dispatchPending()
  console.log(`dispatched: ${result.sent} sent, ${result.failed} failed`)
  await closeDb()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
