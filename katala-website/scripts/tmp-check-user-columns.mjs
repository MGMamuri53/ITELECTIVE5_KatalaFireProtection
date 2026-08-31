import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(String(process.env.DATABASE_SSL || '').toLowerCase() === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
})

const result = await pool.query(
  `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tbl_user'
    ORDER BY ordinal_position`,
)

console.log(result.rows.map((row) => `${row.column_name} | ${row.data_type} | nullable=${row.is_nullable} | default=${row.column_default || ''}`).join('\n'))
await pool.end()
