import 'dotenv/config'
import fs from 'node:fs/promises'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(String(process.env.DATABASE_SSL || '').toLowerCase() === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
})

const sql = await fs.readFile(new URL('../database/katala_staff_assignment_migration.sql', import.meta.url), 'utf8')
await pool.query(sql)
console.log('Applied katala_staff_assignment_migration.sql')
await pool.end()
