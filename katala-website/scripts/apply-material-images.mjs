import 'dotenv/config'
import fs from 'node:fs/promises'
import pg from 'pg'

const databaseUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
const databaseSsl = String(process.env.SUPABASE_DB_SSL ?? 'true').toLowerCase() !== 'false'

if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is missing.')
  process.exit(1)
}

const sql = await fs.readFile(new URL('../database/katala_material_image_urls.sql', import.meta.url), 'utf8')
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : false,
})

try {
  const result = await pool.query(sql)
  const check = await pool.query(`
    SELECT v_productmodel AS model, v_variantimageurl AS image_url, count(*)::int AS variants
    FROM public.tbl_productvariant
    WHERE v_productmodel IN (
      'HK-A-01', 'HK-A-02', 'HK-A-03', 'HK-A-04',
      'HK-C-01', 'HK-C-02', 'HK-C-03', 'HK-C-04',
      'FACP', 'SD-BAT', 'HK-D-09', 'HK-D-10', 'PUMP'
    )
    GROUP BY v_productmodel, v_variantimageurl
    ORDER BY v_productmodel
  `)
  console.log(`Updated ${result.rowCount ?? 0} material variants.`)
  console.table(check.rows)
} finally {
  await pool.end()
}
