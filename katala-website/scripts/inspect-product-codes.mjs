import 'dotenv/config'
import pg from 'pg'

const databaseUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

try {
  const products = await pool.query(`
    SELECT v_productid, v_productcode, v_productname, v_isactive
    FROM public.tbl_product
    ORDER BY v_productid
  `)
  const variants = await pool.query(`
    SELECT v_productid, v_productcode, v_productmodel, v_productsize, v_isactive
    FROM public.tbl_productvariant
    ORDER BY v_productid, v_productmodel, v_productsize
  `)
  console.log('PARENT PRODUCTS')
  console.table(products.rows)
  console.log('PRODUCT VARIANTS')
  console.table(variants.rows)
} finally {
  await pool.end()
}
