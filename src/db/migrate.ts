import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { closeDb, getDb } from './client'

async function main() {
  await migrate(getDb(), { migrationsFolder: './src/db/migrations' })
  await closeDb()
  console.log('migrations applied')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
