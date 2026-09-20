import { existsSync } from 'node:fs'

/**
 * CLI scripts run under tsx, which does not read .env the way Next does.
 * Import this first in any script that talks to the database.
 */
const file = process.env.ENV_FILE ?? '.env'
if (existsSync(file)) {
  process.loadEnvFile(file)
}
