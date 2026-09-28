import 'dotenv/config'
import pg from 'pg'

const databaseUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
const databaseSsl = String(process.env.SUPABASE_DB_SSL ?? 'true').toLowerCase() !== 'false'

function redactUser(username) {
  if (!username) return 'unknown'
  if (username.length <= 8) return username
  return `${username.slice(0, 8)}...${username.slice(-4)}`
}

function summarizeUrl(rawUrl) {
  const parsed = new URL(rawUrl)
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    username: parsed.username,
  }
}

if (!databaseUrl) {
  console.error('Database URL is missing. Set SUPABASE_DB_URL in .env.')
  process.exit(1)
}

let summary
try {
  summary = summarizeUrl(databaseUrl)
} catch {
  console.error('SUPABASE_DB_URL is not a valid Postgres URL.')
  process.exit(1)
}

console.log(`Checking Supabase Postgres at ${summary.host}:${summary.port}/${summary.database} as ${redactUser(summary.username)}...`)

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10_000,
  max: 1,
})

try {
  await pool.query('SELECT 1')
  console.log('Database connection: verified')
} catch (error) {
  console.error(`Database connection failed: ${error.code || error.name}`)
  console.error(error.message)

  if (error.code === '28P01') {
    console.error('Supabase rejected the password in SUPABASE_DB_URL. Copy the pooler string from Supabase Dashboard > Connect and replace only the password.')
    console.error('If the password contains special characters, URL-encode them, for example # becomes %23.')
  } else if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) {
    console.error('Check the pooler host, port, network connection, and SUPABASE_DB_SSL setting.')
  }

  process.exitCode = 1
} finally {
  await pool.end().catch(() => {})
}
