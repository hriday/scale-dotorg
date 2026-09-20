import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/env'
import * as schema from './schema'

let sql: ReturnType<typeof postgres> | undefined
let db: PostgresJsDatabase<typeof schema> | undefined

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) {
    sql = postgres(getEnv().DATABASE_URL, { max: 10 })
    db = drizzle(sql, { schema })
  }
  return db
}

export async function closeDb(): Promise<void> {
  await sql?.end()
  sql = undefined
  db = undefined
}

export type Db = PostgresJsDatabase<typeof schema>
