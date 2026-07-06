import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'data/postoslav.db'

// Ensure the parent directory exists so better-sqlite3 can create the file on first run.
mkdirSync(dirname(url), { recursive: true })

const sqlite = new Database(url)
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
