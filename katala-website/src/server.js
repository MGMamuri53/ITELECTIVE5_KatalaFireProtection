import 'dotenv/config'
import http from 'node:http'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const { Pool } = pg
const port = Number(process.env.PORT || 3001)
const databaseUrl = (process.env.DATABASE_URL || '').trim()
const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
const appOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/$/, '')
const paymongoSecretKey = (process.env.PAYMONGO_SECRET_KEY || '').trim()
const paymongoWebhookSecret = (process.env.PAYMONGO_WEBHOOK_SECRET || '').trim()
const paymongoMethods = (process.env.PAYMONGO_PAYMENT_METHODS || 'card,gcash,qrph')
  .split(',')
  .map((method) => method.trim())
  .filter(Boolean)
const paymongoPassOnFees = String(process.env.PAYMONGO_PASS_ON_FEES || '').toLowerCase() === 'true'
const temporaryQuotationUnitPrice = Number(process.env.TEMP_QUOTATION_UNIT_PRICE || '0.99')
const allowSubmittedQuotationPayments = String(process.env.ALLOW_SUBMITTED_QUOTATION_PAYMENTS || 'true').toLowerCase() === 'true'

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    })
  : null

const supabaseAuth = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null

const requestLog = new Map()

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  })
  res.end(JSON.stringify(payload))
}

function sendCsv(res, filename, content) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  })
  res.end(content)
}

function setCors(req, res) {
  const origin = req.headers.origin
  if (!origin) return

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  const isConfiguredApp = appOrigin && origin === appOrigin
  if (isLocal || isConfiguredApp) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Development-User-Id, X-Development-Role')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  }
}

function clean(value, max = 500) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
    : ''
}

function nullable(value, max = 500) {
  const result = clean(value, max)
  return result || null
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRateLimited(req) {
  const now = Date.now()
  const ip = req.socket.remoteAddress || 'unknown'
  const recent = (requestLog.get(ip) || []).filter((time) => now - time < 60_000)
  recent.push(now)
  requestLog.set(ip, recent)
  return recent.length > 30
}

async function readRawBody(req, maxSize = 64_000) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxSize) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readBody(req) {
  const raw = (await readRawBody(req)).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function createReference(prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const code = randomBytes(4).toString('hex').toUpperCase()
  return `${prefix}-${date}-${code}`
}

function getBearerToken(req) {
  const header = clean(req.headers.authorization, 4000)
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function authRole(user) {
  const email = String(user?.email || '').toLowerCase()
  const app = user?.app_metadata || {}
  const meta = user?.user_metadata || {}
  const configuredAdmins = csv(process.env.ADMIN_EMAILS)
  const configuredStaff = csv(process.env.STAFF_EMAILS)

  if (configuredAdmins.includes(email)) return 'admin'
  if (configuredStaff.includes(email)) return 'staff'

  const role = String(
    app.role
      || app.user_role
      || meta.role
      || meta.account_type
      || 'customer',
  ).trim().toLowerCase()

  return ['admin', 'staff', 'customer'].includes(role) ? role : 'customer'
}

async function databaseRole(userId) {
  if (!pool || !isUuid(userId)) return ''
  const result = await pool.query(
    `SELECT r.v_rolename
       FROM public.tbl_userrole ur
       JOIN public.tbl_role r ON r.v_roleid = ur.v_roleid
      WHERE ur.v_userid = $1
        AND r.v_isactive = TRUE
      ORDER BY CASE LOWER(r.v_rolename)
        WHEN 'admin' THEN 1
        WHEN 'administrator' THEN 1
        WHEN 'staff' THEN 2
        WHEN 'customer' THEN 3
        ELSE 4
      END
      LIMIT 1`,
    [userId],
  )

  const role = String(result.rows[0]?.v_rolename || '').trim().toLowerCase()
  if (role === 'administrator') return 'admin'
  return ['admin', 'staff', 'customer'].includes(role) ? role : ''
}

function normalizePortalRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'administrator') return 'admin'
  return ['admin', 'staff', 'customer'].includes(value) ? value : ''
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'staff') return 'Staff'
  return 'Customer'
}

function normalizeAccountStatus(status, fallback = 'Active') {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'pending') return 'Pending'
  if (value === 'inactive') return 'Inactive'
  if (value === 'suspended') return 'Suspended'
  if (value === 'verified' || value === 'active') return 'Active'
  return fallback
}

async function userAccountRecord(userId, client = pool) {
  if (!client || !isUuid(userId)) return null
  const result = await client.query(
    `SELECT v_userid, v_firstname, v_lastname, v_emailaddress, v_contactnumber,
            v_accountstatus, v_companyname, v_jobtitle, v_industry, v_companyaddress
       FROM public.tbl_user
      WHERE v_userid = $1
      LIMIT 1`,
    [userId],
  )
  return result.rows[0] || null
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req)
  if (token && supabaseAuth) {
    const { data, error } = await supabaseAuth.auth.getUser(token)
    if (!error && data?.user?.id) {
      const account = await userAccountRecord(data.user.id).catch(() => null)
      return {
        id: data.user.id,
        email: data.user.email || '',
        name: account ? [account.v_firstname, account.v_lastname].filter(Boolean).join(' ') : '',
        accountStatus: normalizeAccountStatus(account?.v_accountstatus),
        companyName: account?.v_companyname || null,
        contactNumber: account?.v_contactnumber || null,
        role: await databaseRole(data.user.id) || authRole(data.user),
      }
    }
  }

  // Optional local-development fallback. Never use this in production.
  if (process.env.NODE_ENV !== 'production') {
    const candidate = clean(req.headers['x-development-user-id'], 80)
    if (isUuid(candidate)) {
      const devRole = clean(req.headers['x-development-role'], 30).toLowerCase()
      const account = await userAccountRecord(candidate).catch(() => null)
      return {
        id: candidate,
        email: account?.v_emailaddress || 'development@katala.local',
        name: account ? [account.v_firstname, account.v_lastname].filter(Boolean).join(' ') : '',
        accountStatus: normalizeAccountStatus(account?.v_accountstatus),
        companyName: account?.v_companyname || null,
        contactNumber: account?.v_contactnumber || null,
        role: ['admin', 'staff'].includes(devRole) ? devRole : 'customer',
      }
    }
  }
  return null
}

async function requirePortalUser(req, res, allowedRoles) {
  const user = await getAuthenticatedUser(req)
  if (!user?.id) {
    sendJson(res, 401, { error: 'Please sign in to continue.' })
    return null
  }
  if (!allowedRoles.includes(user.role)) {
    sendJson(res, 403, { error: 'This account does not have access to that portal.' })
    return null
  }
  if (normalizeAccountStatus(user.accountStatus) !== 'Active') {
    sendJson(res, 403, { error: 'This account is waiting for administrator approval.' })
    return null
  }
  return user
}

async function requireCustomer(req, res) {
  return await requirePortalUser(req, res, ['customer'])
}

async function handleSession(req, res, user) {
  const userId = user.id
  const result = await pool.query(
    `SELECT v_userid, v_firstname, v_lastname, v_emailaddress, v_contactnumber,
            v_accountstatus, v_companyname, v_jobtitle, v_industry, v_companyaddress
       FROM public.tbl_user
      WHERE v_userid = $1
      LIMIT 1`,
    [userId],
  )
  if (!result.rowCount) return sendJson(res, 404, { error: 'Customer profile not found.' })

  const row = result.rows[0]
  return sendJson(res, 200, {
    ok: true,
    user: {
      userId: row.v_userid,
      email: row.v_emailaddress,
      name: [row.v_firstname, row.v_lastname].filter(Boolean).join(' '),
      contactNumber: row.v_contactnumber,
      companyName: row.v_companyname,
      jobTitle: row.v_jobtitle,
      industry: row.v_industry,
      companyAddress: row.v_companyaddress,
      accountStatus: row.v_accountstatus,
      role: user.role,
    },
  })
}

async function handlePortalSession(req, res, user) {
  return sendJson(res, 200, {
    ok: true,
    user: {
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
      companyName: user.companyName,
      contactNumber: user.contactNumber,
      accountStatus: user.accountStatus,
      role: user.role,
    },
  })
}

async function handleUpdateOwnProfile(req, res, user) {
  const body = await readBody(req)
  const firstName = clean(body.firstName, 120)
  const lastName = clean(body.lastName, 120)
  if (!firstName || !lastName) return sendJson(res, 400, { error: 'First name and last name are required.' })

  const result = await pool.query(
    `UPDATE public.tbl_user
        SET v_firstname = $2,
            v_lastname = $3,
            v_contactnumber = $4,
            v_companyname = $5,
            v_jobtitle = $6,
            v_industry = $7,
            v_companyaddress = $8,
            v_updatedat = now()
      WHERE v_userid = $1
      RETURNING v_userid, v_firstname, v_lastname, v_emailaddress, v_contactnumber,
                v_accountstatus, v_companyname, v_jobtitle, v_industry, v_companyaddress`,
    [
      user.id,
      firstName,
      lastName,
      nullable(body.contactNumber, 40),
      nullable(body.companyName, 160),
      nullable(body.jobTitle, 120),
      nullable(body.industry, 120),
      nullable(body.companyAddress, 500),
    ],
  )
  if (!result.rowCount) return sendJson(res, 404, { error: 'Account profile not found.' })

  const row = result.rows[0]
  return sendJson(res, 200, {
    ok: true,
    user: {
      userId: row.v_userid,
      email: row.v_emailaddress,
      name: [row.v_firstname, row.v_lastname].filter(Boolean).join(' '),
      contactNumber: row.v_contactnumber,
      companyName: row.v_companyname,
      jobTitle: row.v_jobtitle,
      industry: row.v_industry,
      companyAddress: row.v_companyaddress,
      accountStatus: normalizeAccountStatus(row.v_accountstatus),
      role: user.role,
    },
  })
}

function requireDatabase(res) {
  if (pool) return true
  sendJson(res, 503, {
    error: 'Database is not connected yet. Set DATABASE_URL when you are ready. This server does not create or migrate any table.',
  })
  return false
}

async function ensureRole(client, role) {
  const normalized = normalizePortalRole(role) || 'customer'
  const label = roleLabel(normalized)
  await client.query(
    `INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive)
     SELECT $1::varchar, $2::text, TRUE
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tbl_role WHERE LOWER(v_rolename) = LOWER($1::varchar)
     )`,
    [label, `${label} portal account`],
  )
  const result = await client.query(
    `SELECT v_roleid
       FROM public.tbl_role
      WHERE LOWER(v_rolename) = LOWER($1)
      LIMIT 1`,
    [label],
  )
  return result.rows[0]?.v_roleid
}

async function assignSingleRole(client, userId, role) {
  const normalized = normalizePortalRole(role) || 'customer'
  const roleId = await ensureRole(client, normalized)
  if (!roleId) throw new Error('ROLE_NOT_FOUND')
  await client.query('DELETE FROM public.tbl_userrole WHERE v_userid = $1', [userId])
  await client.query(
    `INSERT INTO public.tbl_userrole (v_userid, v_roleid)
     VALUES ($1, $2)`,
    [userId, roleId],
  )
}

function publicSignupRole(value) {
  const role = normalizePortalRole(value)
  return role === 'staff' ? 'staff' : 'customer'
}

async function handleRegisterProfile(req, res) {
  const body = await readBody(req)
  const userId = clean(body.userId, 80)
  const email = clean(body.email, 180).toLowerCase()
  const firstName = clean(body.firstName, 120)
  const lastName = clean(body.lastName, 120)
  const accountType = publicSignupRole(body.accountType)
  const status = accountType === 'staff' ? 'Pending' : 'Active'

  if (!isUuid(userId)) return sendJson(res, 400, { error: 'Invalid signup user id.' })
  if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'Complete the required signup fields.' })
  }

  const result = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.tbl_user
        (v_userid, v_firstname, v_lastname, v_emailaddress, v_contactnumber,
         v_accountstatus, v_companyname, v_jobtitle, v_industry, v_companyaddress)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (v_userid) DO UPDATE SET
         v_firstname = EXCLUDED.v_firstname,
         v_lastname = EXCLUDED.v_lastname,
         v_emailaddress = EXCLUDED.v_emailaddress,
         v_contactnumber = EXCLUDED.v_contactnumber,
         v_companyname = EXCLUDED.v_companyname,
         v_jobtitle = EXCLUDED.v_jobtitle,
         v_industry = EXCLUDED.v_industry,
         v_companyaddress = EXCLUDED.v_companyaddress,
         v_updatedat = now()
       RETURNING v_userid, v_accountstatus`,
      [
        userId,
        firstName,
        lastName,
        email,
        nullable(body.contactNumber, 40),
        status,
        nullable(body.companyName, 160),
        nullable(body.jobTitle, 120),
        nullable(body.industry, 120),
        nullable(body.companyAddress, 500),
      ],
    )
    await assignSingleRole(client, userId, accountType)
    return inserted.rows[0]
  })

  return sendJson(res, 201, {
    ok: true,
    userId: result.v_userid,
    role: accountType,
    accountStatus: status,
    requiresApproval: accountType === 'staff',
  })
}

function accountDto(row) {
  const role = normalizePortalRole(row.role_name) || 'customer'
  const name = [row.v_firstname, row.v_lastname].filter(Boolean).join(' ') || row.v_emailaddress
  return {
    id: row.v_userid,
    accountId: `${roleLabel(role).slice(0, 3).toUpperCase()}-${String(row.v_userid).slice(0, 8).toUpperCase()}`,
    name,
    email: row.v_emailaddress,
    role,
    roleLabel: roleLabel(role),
    status: normalizeAccountStatus(row.v_accountstatus),
    companyName: row.v_companyname || '',
    contactNumber: row.v_contactnumber || '',
    createdAt: row.v_createdat,
  }
}

async function listAccounts(client = pool) {
  const result = await client.query(
    `SELECT DISTINCT ON (u.v_userid)
            u.v_userid, u.v_firstname, u.v_lastname, u.v_emailaddress, u.v_contactnumber,
            u.v_accountstatus, u.v_companyname, u.v_createdat,
            r.v_rolename AS role_name
       FROM public.tbl_user u
       LEFT JOIN public.tbl_userrole ur ON ur.v_userid = u.v_userid
       LEFT JOIN public.tbl_role r ON r.v_roleid = ur.v_roleid
      ORDER BY u.v_userid,
        CASE LOWER(COALESCE(r.v_rolename, 'customer'))
          WHEN 'admin' THEN 1
          WHEN 'administrator' THEN 1
          WHEN 'staff' THEN 2
          WHEN 'customer' THEN 3
          ELSE 4
        END`,
  )
  const accounts = result.rows
    .map(accountDto)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return {
    accounts,
    summary: {
      customers: accounts.filter((item) => item.role === 'customer').length,
      staff: accounts.filter((item) => item.role === 'staff').length,
      pending: accounts.filter((item) => item.status === 'Pending').length,
    },
  }
}

async function handleListAccounts(req, res) {
  return sendJson(res, 200, { ok: true, ...(await listAccounts()) })
}

async function handleUpdateAccount(req, res, userId) {
  if (!isUuid(userId)) return sendJson(res, 400, { error: 'Invalid account id.' })
  const body = await readBody(req)
  const nextRole = body.role === undefined ? '' : normalizePortalRole(body.role)
  const nextStatus = body.status === undefined ? '' : normalizeAccountStatus(body.status, '')
  if (body.role !== undefined && !nextRole) return sendJson(res, 400, { error: 'Select a valid role.' })
  if (body.status !== undefined && !nextStatus) return sendJson(res, 400, { error: 'Select a valid account status.' })

  await transaction(async (client) => {
    const existing = await userAccountRecord(userId, client)
    if (!existing) {
      const error = new Error('USER_NOT_FOUND')
      error.statusCode = 404
      throw error
    }
    if (nextStatus) {
      await client.query(
        'UPDATE public.tbl_user SET v_accountstatus = $2, v_updatedat = now() WHERE v_userid = $1',
        [userId, nextStatus],
      )
    }
    if (nextRole) await assignSingleRole(client, userId, nextRole)
  })

  return sendJson(res, 200, { ok: true, ...(await listAccounts()) })
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

async function existingTables(tableNames) {
  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tableNames],
  )
  return new Set(result.rows.map((row) => row.table_name))
}

async function handleDatabaseBackup(req, res) {
  const tables = [
    'tbl_user',
    'tbl_role',
    'tbl_userrole',
    'tbl_product',
    'tbl_productvariant',
    'tbl_service',
    'tbl_quotation',
    'tbl_quotationitem',
    'tbl_servicerequest',
    'tbl_paymenttransaction',
  ]
  const found = await existingTables(tables)
  const lines = [['table_name', 'row_data_json'].map(csvCell).join(',')]

  for (const table of tables.filter((name) => found.has(name))) {
    const result = await pool.query(`SELECT row_to_json(t) AS row_data FROM public.${table} t`)
    for (const row of result.rows) {
      lines.push([table, JSON.stringify(row.row_data || {})].map(csvCell).join(','))
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  return sendCsv(res, `katala-database-backup-${date}.csv`, lines.join('\n'))
}

async function paymentTableExists(client = pool) {
  const result = await client.query("SELECT to_regclass('public.tbl_paymenttransaction') AS table_name")
  return Boolean(result.rows[0]?.table_name)
}

function requirePaymentTableReady(res) {
  return paymentTableExists().then((ready) => {
    if (ready) return true
    sendJson(res, 503, {
      error: 'Payment transactions are not configured yet. Run database/paymongo_transactions.sql in Supabase, then try again.',
    })
    return false
  })
}

async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const columnCache = new Map()

async function tableColumns(tableName, client = pool) {
  if (columnCache.has(tableName)) return columnCache.get(tableName)
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  )
  const columns = new Set(result.rows.map((row) => row.column_name))
  columnCache.set(tableName, columns)
  return columns
}

function firstColumn(columns, names) {
  return names.find((name) => columns.has(name)) || ''
}

function optionalSelect(columns, names, alias, fallback = 'NULL') {
  const column = firstColumn(columns, names)
  return column ? `${column} AS ${alias}` : `${fallback} AS ${alias}`
}

function buildInsert(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  const columns = entries.map(([key]) => key)
  const params = entries.map((_, index) => `$${index + 1}`)
  return {
    sql: `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${params.join(', ')}) RETURNING *`,
    params: entries.map(([, value]) => value),
  }
}

function buildUpdate(table, idColumn, idValue, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  if (!entries.length) return null
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`)
  return {
    sql: `UPDATE public.${table} SET ${assignments.join(', ')} WHERE ${idColumn} = $1 RETURNING *`,
    params: [idValue, ...entries.map(([, value]) => value)],
  }
}

function materialStatus(row) {
  if (!row.is_active) return 'Inactive'
  if (row.stock_quantity === null || row.stock_quantity === undefined) return 'Active'
  const stock = Number(row.stock_quantity || 0)
  const reorder = Number(row.reorder_level || 0)
  if (stock <= 0) return 'Out of Stock'
  if (reorder > 0 && stock <= reorder) return 'Low Stock'
  return 'Active'
}

async function listMaterials(client = pool) {
  const productColumns = await tableColumns('tbl_product', client)
  const variantColumns = await tableColumns('tbl_productvariant', client)
  const categoryExpr = productColumns.has('v_productcategory')
    ? 'p.v_productcategory'
    : productColumns.has('v_category')
      ? 'p.v_category'
      : productColumns.has('v_producttype')
        ? 'p.v_producttype'
        : 'NULL'
  const stockExpr = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
  const reorderExpr = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])

  const result = await client.query(
    `SELECT p.v_productid,
            p.v_productname,
            ${categoryExpr} AS category,
            pv.v_productvariantid,
            pv.v_productcode,
            pv.v_productmodel,
            pv.v_productsize,
            pv.v_productunit,
            pv.v_isactive AS is_active,
            ${stockExpr ? `pv.${stockExpr}` : 'NULL'} AS stock_quantity,
            ${reorderExpr ? `pv.${reorderExpr}` : 'NULL'} AS reorder_level
       FROM public.tbl_productvariant pv
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      ORDER BY p.v_productname, pv.v_productmodel, pv.v_productsize`,
  )

  return result.rows.map((row) => ({
    productId: row.v_productid,
    variantId: row.v_productvariantid,
    sku: row.v_productcode || '',
    name: row.v_productname || '',
    category: row.category || 'Uncategorized',
    model: row.v_productmodel || '',
    size: row.v_productsize || '',
    unit: row.v_productunit || '',
    stock: row.stock_quantity === null || row.stock_quantity === undefined ? null : Number(row.stock_quantity),
    reorderLevel: row.reorder_level === null || row.reorder_level === undefined ? null : Number(row.reorder_level),
    active: Boolean(row.is_active),
    status: materialStatus(row),
  }))
}

async function listServices(client = pool) {
  const serviceColumns = await tableColumns('tbl_service', client)
  const result = await client.query(
    `SELECT v_serviceid,
            v_servicecode,
            v_servicename,
            v_isactive,
            ${optionalSelect(serviceColumns, ['v_servicecategory', 'v_category'], 'category')},
            ${optionalSelect(serviceColumns, ['v_estimatedduration', 'v_duration'], 'duration')},
            ${optionalSelect(serviceColumns, ['v_servicedescription', 'v_description'], 'description')}
       FROM public.tbl_service
      ORDER BY v_servicename`,
  )

  return result.rows.map((row) => ({
    serviceId: row.v_serviceid,
    code: row.v_servicecode || '',
    name: row.v_servicename || '',
    category: row.category || 'Service',
    duration: row.duration || '',
    description: row.description || '',
    active: Boolean(row.v_isactive),
    status: row.v_isactive ? 'Active' : 'Draft',
  }))
}

function quotationFields(body) {
  return {
    projectName: nullable(body.projectName, 160),
    establishmentName: nullable(body.establishmentName, 160),
    projectDescription: nullable(body.projectDescription, 2000),
    projectAddress: nullable(body.projectAddress, 1000),
    customerRemarks: nullable(body.customerRemarks, 2000),
  }
}

function manilaNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  }
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function normalizePreferredTime(value) {
  if (!value) return null
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
  if (!match) return null
  return `${match[1]}:${match[2]}`
}

function validatePreferredSchedule(preferredDate, preferredTime) {
  if (preferredTime && !preferredDate) {
    return 'Select a preferred date before choosing a preferred time.'
  }

  if (preferredDate && !validIsoDate(preferredDate)) {
    return 'Preferred date is invalid.'
  }

  if (preferredTime && !normalizePreferredTime(preferredTime)) {
    return 'Preferred time is invalid.'
  }

  if (!preferredDate) return null

  const now = manilaNowParts()
  if (preferredDate < now.date) {
    return 'Preferred date cannot be in the past.'
  }

  const normalizedTime = normalizePreferredTime(preferredTime)
  if (preferredDate === now.date && normalizedTime && normalizedTime <= now.time) {
    return 'Preferred time must be later than the current time for today.'
  }

  return null
}

function serviceRequestFields(body) {
  const priority = clean(body.priorityLevel, 30) || 'Normal'
  if (!['Low', 'Normal', 'High', 'Urgent'].includes(priority)) {
    return { error: 'Invalid priority level.' }
  }

  const problemDescription = clean(body.problemDescription, 2500)
  if (problemDescription.length < 5) return { error: 'Please describe the service requirement.' }

  const preferredDate = nullable(body.preferredDate, 20)
  const preferredTimeRaw = nullable(body.preferredTime, 20)
  const scheduleError = validatePreferredSchedule(preferredDate, preferredTimeRaw)
  if (scheduleError) return { error: scheduleError }
  const preferredTime = normalizePreferredTime(preferredTimeRaw)

  const userAddressId = nullable(body.userAddressId, 80)
  if (userAddressId && !isUuid(userAddressId)) return { error: 'Invalid saved address.' }

  return {
    values: {
      userAddressId,
      projectName: nullable(body.projectName, 160),
      establishmentName: nullable(body.establishmentName, 160),
      contactPerson: nullable(body.contactPerson, 160),
      contactNumber: nullable(body.contactNumber, 60),
      problemDescription,
      projectAddress: nullable(body.projectAddress, 1000),
      preferredDate,
      preferredTime,
      priorityLevel: priority,
      customerRemarks: nullable(body.customerRemarks, 2000),
    },
  }
}

function validateQuotationItems(body) {
  const source = Array.isArray(body.items) ? body.items : []
  if (source.length < 1 || source.length > 30) return { error: 'A quotation must contain between 1 and 30 product items.' }

  const items = []
  for (const raw of source) {
    const productName = clean(raw?.productName, 180)
    const productModel = nullable(raw?.productModel, 180)
    const productSize = nullable(raw?.productSize, 120)
    const itemDescription = nullable(raw?.itemDescription, 1000)
    const quantity = Number(raw?.quantity)

    if (!productName) return { error: 'A product name is missing.' }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: 'Product quantity must be between 1 and 999.' }
    items.push({ productName, productModel, productSize, itemDescription, quantity })
  }
  return { items }
}

async function ensureUserExists(client, userId) {
  const result = await client.query(
    'SELECT v_accountstatus FROM public.tbl_user WHERE v_userid = $1 LIMIT 1',
    [userId],
  )
  if (!result.rowCount) {
    const error = new Error('USER_NOT_FOUND')
    error.statusCode = 409
    throw error
  }
  if (String(result.rows[0].v_accountstatus || '').toLowerCase() !== 'active') {
    const error = new Error('ACCOUNT_NOT_ACTIVE')
    error.statusCode = 403
    throw error
  }
}

async function resolveProductVariant(client, item) {
  const params = [item.productName]
  const conditions = [
    'LOWER(p.v_productname) = LOWER($1)',
    'p.v_isactive = TRUE',
    'pv.v_isactive = TRUE',
  ]

  if (item.productModel) {
    params.push(item.productModel)
    conditions.push(`LOWER(COALESCE(pv.v_productmodel, '')) = LOWER($${params.length})`)
  }
  if (item.productSize) {
    params.push(item.productSize)
    conditions.push(`LOWER(COALESCE(pv.v_productsize, '')) = LOWER($${params.length})`)
  }

  const result = await client.query(
    `SELECT pv.v_productvariantid, pv.v_productcode, pv.v_productmodel, pv.v_productsize
       FROM public.tbl_productvariant pv
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE ${conditions.join(' AND ')}
      LIMIT 2`,
    params,
  )

  if (result.rowCount !== 1) {
    const error = new Error(result.rowCount === 0 ? 'PRODUCT_VARIANT_NOT_FOUND' : 'PRODUCT_VARIANT_AMBIGUOUS')
    error.statusCode = 409
    error.item = item
    throw error
  }
  return result.rows[0]
}

async function assertRequestedStockAvailable(client, variantId, item) {
  const variantColumns = await tableColumns('tbl_productvariant', client)
  const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
  if (!stockColumn) return

  const result = await client.query(
    `SELECT ${stockColumn} AS stock_quantity
       FROM public.tbl_productvariant
      WHERE v_productvariantid = $1
      LIMIT 1`,
    [variantId],
  )
  const stock = Number(result.rows[0]?.stock_quantity)
  if (Number.isFinite(stock) && stock < Number(item.quantity)) {
    const error = new Error('INSUFFICIENT_STOCK')
    error.statusCode = 409
    error.item = item
    error.stock = stock
    throw error
  }
}

async function resolveService(client, serviceName) {
  const result = await client.query(
    `SELECT v_serviceid, v_servicecode, v_servicename
       FROM public.tbl_service
      WHERE LOWER(v_servicename) = LOWER($1)
        AND v_isactive = TRUE
      LIMIT 2`,
    [serviceName],
  )

  if (result.rowCount !== 1) {
    const error = new Error(result.rowCount === 0 ? 'SERVICE_NOT_FOUND' : 'SERVICE_AMBIGUOUS')
    error.statusCode = 409
    throw error
  }
  return result.rows[0]
}

async function verifyAddressOwnership(client, userId, userAddressId) {
  if (!userAddressId) return
  const result = await client.query(
    'SELECT 1 FROM public.tbl_useraddress WHERE v_useraddressid = $1 AND v_userid = $2 LIMIT 1',
    [userAddressId, userId],
  )
  if (!result.rowCount) {
    const error = new Error('ADDRESS_NOT_OWNED')
    error.statusCode = 403
    throw error
  }
}

function toMoneyNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

function toCentavos(value) {
  return Math.round(toMoneyNumber(value) * 100)
}

function quotationUnitPrice(value) {
  if (value !== null && value !== undefined) return toMoneyNumber(value)
  return temporaryQuotationUnitPrice > 0 ? toMoneyNumber(temporaryQuotationUnitPrice) : null
}

function paymentStatusDto(row) {
  if (!row) return null
  return {
    referenceNumber: row.v_referencenumber,
    status: row.v_status,
    amount: toMoneyNumber(row.v_amount),
    currency: row.v_currency || 'PHP',
    checkoutSessionId: row.v_paymongo_checkoutsessionid,
    paymentId: row.v_paymongo_paymentid,
    paymentMethod: row.v_paymentmethod,
    receiptNumber: row.v_receiptnumber,
    paidAt: row.v_paidat,
    createdAt: row.v_createdat,
    updatedAt: row.v_updatedat,
  }
}

function quotationTotals(row, items) {
  const subtotal = items.reduce((sum, item) => {
    const unitPrice = item.unitPrice === null || item.unitPrice === undefined ? null : toMoneyNumber(item.unitPrice)
    return sum + (unitPrice ? unitPrice * Number(item.quantity || 0) : 0)
  }, 0)
  const additionalCost = toMoneyNumber(row.v_additionalcost)
  return {
    subtotal: toMoneyNumber(subtotal),
    additionalCost,
    totalAmount: toMoneyNumber(subtotal + additionalCost),
  }
}

function quotationDto(row, items = [], payment = null) {
  const totals = quotationTotals(row, items)
  const quotationStatus = String(row.v_quotationstatus || '').toLowerCase()
  const payableStatuses = ['accepted', 'approved', 'ready for payment', 'for payment']
  if (allowSubmittedQuotationPayments) payableStatuses.push('submitted')

  return {
    referenceNumber: row.v_referencenumber,
    projectName: row.v_projectname,
    establishmentName: row.v_establishmentname,
    projectDescription: row.v_projectdescription,
    projectAddress: row.v_projectaddress,
    customerRemarks: row.v_customerremarks,
    status: row.v_quotationstatus,
    validUntil: row.v_validuntil,
    submittedAt: row.v_submittedat,
    updatedAt: row.v_updatedat,
    additionalCost: totals.additionalCost,
    subtotal: totals.subtotal,
    totalAmount: totals.totalAmount,
    canPay: payableStatuses.includes(quotationStatus)
      && totals.totalAmount > 0
      && items.every((item) => item.unitPrice !== null && item.unitPrice !== undefined),
    paymongoConfigured: Boolean(paymongoSecretKey),
    payment: paymentStatusDto(payment),
    items,
  }
}

async function handleCreateQuotation(req, res, userId) {
  const body = await readBody(req)
  const itemResult = validateQuotationItems(body)
  if (itemResult.error) return sendJson(res, 400, { error: itemResult.error })
  const fields = quotationFields(body)
  const referenceNumber = createReference('QT')

  const result = await transaction(async (client) => {
    await ensureUserExists(client, userId)
    const resolvedItems = []
    for (const item of itemResult.items) {
      const variant = await resolveProductVariant(client, item)
      await assertRequestedStockAvailable(client, variant.v_productvariantid, item)
      resolvedItems.push({ ...item, variant })
    }

    const quotation = await client.query(
      `INSERT INTO public.tbl_quotation
        (v_userid, v_referencenumber, v_projectname, v_establishmentname, v_projectdescription, v_projectaddress, v_customerremarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        referenceNumber,
        fields.projectName,
        fields.establishmentName,
        fields.projectDescription,
        fields.projectAddress,
        fields.customerRemarks,
      ],
    )

    const quotationId = quotation.rows[0].v_quotationid
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO public.tbl_quotationproductitem
          (v_quotationid, v_productvariantid, v_quantity, v_itemdescription, v_unitprice)
         VALUES ($1, $2, $3, $4, $5)`,
        [quotationId, item.variant.v_productvariantid, item.quantity, item.itemDescription, temporaryQuotationUnitPrice],
      )
    }

    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, 'Submitted', 'Submitted by customer')`,
      [quotationId, userId],
    )

    return quotation.rows[0]
  })

  return sendJson(res, 201, {
    ok: true,
    referenceNumber: result.v_referencenumber,
    status: result.v_quotationstatus,
    message: `Quotation request submitted with temporary test pricing at PHP ${temporaryQuotationUnitPrice.toFixed(2)} per item.`,
  })
}

async function loadQuotation(userId, referenceNumber) {
  const quotation = await pool.query(
    `SELECT * FROM public.tbl_quotation
      WHERE v_userid = $1 AND v_referencenumber = $2
      LIMIT 1`,
    [userId, referenceNumber],
  )
  if (!quotation.rowCount) return null

  const items = await pool.query(
    `SELECT qpi.v_quantity, qpi.v_unitprice, qpi.v_itemdescription,
            pv.v_productcode, pv.v_productmodel, pv.v_productsize, pv.v_productunit,
            p.v_productname
       FROM public.tbl_quotationproductitem qpi
       JOIN public.tbl_productvariant pv ON pv.v_productvariantid = qpi.v_productvariantid
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE qpi.v_quotationid = $1
      ORDER BY qpi.v_createdat`,
    [quotation.rows[0].v_quotationid],
  )

  return quotationDto(
    quotation.rows[0],
    items.rows.map((item) => ({
      productName: item.v_productname,
      productCode: item.v_productcode,
      productModel: item.v_productmodel,
      productSize: item.v_productsize,
      productUnit: item.v_productunit,
      quantity: item.v_quantity,
      unitPrice: quotationUnitPrice(item.v_unitprice),
      lineTotal: quotationUnitPrice(item.v_unitprice) === null ? null : toMoneyNumber(quotationUnitPrice(item.v_unitprice) * Number(item.v_quantity || 0)),
      itemDescription: item.v_itemdescription,
    })),
    await loadLatestPayment(userId, quotation.rows[0].v_quotationid),
  )
}

async function loadLatestPayment(userId, quotationId) {
  if (!(await paymentTableExists())) return null
  const result = await pool.query(
    `SELECT *
       FROM public.tbl_paymenttransaction
      WHERE v_userid = $1
        AND v_quotationid = $2
      ORDER BY v_createdat DESC
      LIMIT 1`,
    [userId, quotationId],
  )
  return result.rows[0] || null
}

async function handleGetQuotation(req, res, userId, referenceNumber) {
  const quotation = await loadQuotation(userId, referenceNumber)
  if (!quotation) return sendJson(res, 404, { error: 'Quotation not found.' })
  return sendJson(res, 200, { ok: true, quotation })
}

async function handleUpdateQuotation(req, res, userId, referenceNumber) {
  const body = await readBody(req)
  const fields = quotationFields(body)

  const result = await pool.query(
    `UPDATE public.tbl_quotation
        SET v_projectname = $3,
            v_establishmentname = $4,
            v_projectdescription = $5,
            v_projectaddress = $6,
            v_customerremarks = $7,
            v_updatedat = NOW()
      WHERE v_userid = $1
        AND v_referencenumber = $2
        AND v_quotationstatus = 'Submitted'
      RETURNING *`,
    [
      userId,
      referenceNumber,
      fields.projectName,
      fields.establishmentName,
      fields.projectDescription,
      fields.projectAddress,
      fields.customerRemarks,
    ],
  )

  if (!result.rowCount) {
    const existing = await pool.query(
      'SELECT v_quotationstatus FROM public.tbl_quotation WHERE v_userid = $1 AND v_referencenumber = $2 LIMIT 1',
      [userId, referenceNumber],
    )
    if (!existing.rowCount) return sendJson(res, 404, { error: 'Quotation not found.' })
    return sendJson(res, 409, { error: `Quotation can no longer be edited because its status is ${existing.rows[0].v_quotationstatus}.` })
  }

  const quotation = await loadQuotation(userId, referenceNumber)
  return sendJson(res, 200, { ok: true, quotation })
}

async function handleCancelQuotation(req, res, userId, referenceNumber) {
  const result = await transaction(async (client) => {
    const quotation = await client.query(
      `SELECT * FROM public.tbl_quotation
        WHERE v_userid = $1 AND v_referencenumber = $2
        FOR UPDATE`,
      [userId, referenceNumber],
    )
    if (!quotation.rowCount) return { notFound: true }

    const row = quotation.rows[0]
    if (['Accepted', 'Rejected', 'Expired', 'Cancelled'].includes(row.v_quotationstatus)) {
      return { blocked: row.v_quotationstatus }
    }

    await client.query(
      `UPDATE public.tbl_quotation
          SET v_quotationstatus = 'Cancelled', v_updatedat = NOW()
        WHERE v_quotationid = $1`,
      [row.v_quotationid],
    )
    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, 'Cancelled', 'Cancelled by customer')`,
      [row.v_quotationid, userId],
    )
    return { cancelled: true }
  })

  if (result.notFound) return sendJson(res, 404, { error: 'Quotation not found.' })
  if (result.blocked) return sendJson(res, 409, { error: `Quotation cannot be cancelled because its status is ${result.blocked}.` })
  return sendJson(res, 200, { ok: true, message: 'Quotation request cancelled.' })
}

function publicAppBase(req) {
  const origin = req.headers.origin && /^https?:\/\//i.test(req.headers.origin)
    ? req.headers.origin
    : appOrigin
  return (origin || `http://${req.headers.host || `localhost:${port}`}`).replace(/\/$/, '')
}

function paymongoAuthHeader() {
  return `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString('base64')}`
}

function paymongoApiError(data, fallback) {
  const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.message || data?.error
  return clean(detail || fallback, 1000)
}

async function paymongoRequest(path, options = {}) {
  if (!paymongoSecretKey) {
    const error = new Error('PAYMONGO_NOT_CONFIGURED')
    error.statusCode = 503
    throw error
  }

  const response = await fetch(`https://api.paymongo.com${path}`, {
    ...options,
    headers: {
      'Authorization': paymongoAuthHeader(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error('PAYMONGO_API_ERROR')
    error.statusCode = response.status >= 500 ? 502 : 400
    error.publicMessage = paymongoApiError(data, 'PayMongo rejected the payment request.')
    throw error
  }
  return data
}

function receiptNumber() {
  return createReference('RCPT')
}

function transactionReference(quotationReference) {
  return `${quotationReference}-PAY-${randomBytes(3).toString('hex').toUpperCase()}`
}

function checkoutLineItems(quotation) {
  const items = quotation.items
    .map((item) => ({
      name: [item.productName, item.productSize || item.productModel].filter(Boolean).join(' - ').slice(0, 180),
      amount: toCentavos(item.unitPrice),
      currency: 'PHP',
      quantity: Number(item.quantity),
      description: clean(item.itemDescription || item.productCode || 'Katala quotation item', 500),
    }))
    .filter((item) => item.amount > 0)

  if (quotation.additionalCost > 0) {
    items.push({
      name: 'Additional project cost',
      amount: toCentavos(quotation.additionalCost),
      currency: 'PHP',
      quantity: 1,
      description: 'Additional reviewed cost from Katala quotation',
    })
  }
  return items
}

async function loadPayableQuotation(client, userId, referenceNumber) {
  const quotation = await client.query(
    `SELECT *
       FROM public.tbl_quotation
      WHERE v_userid = $1
        AND v_referencenumber = $2
      LIMIT 1`,
    [userId, referenceNumber],
  )
  if (!quotation.rowCount) return null

  const items = await client.query(
    `SELECT qpi.v_quantity, qpi.v_unitprice, qpi.v_itemdescription,
            pv.v_productcode, pv.v_productmodel, pv.v_productsize, pv.v_productunit,
            p.v_productname
       FROM public.tbl_quotationproductitem qpi
       JOIN public.tbl_productvariant pv ON pv.v_productvariantid = qpi.v_productvariantid
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE qpi.v_quotationid = $1
      ORDER BY qpi.v_createdat`,
    [quotation.rows[0].v_quotationid],
  )

  const mappedItems = items.rows.map((item) => ({
    productName: item.v_productname,
    productCode: item.v_productcode,
    productModel: item.v_productmodel,
    productSize: item.v_productsize,
    productUnit: item.v_productunit,
    quantity: item.v_quantity,
    unitPrice: quotationUnitPrice(item.v_unitprice),
    itemDescription: item.v_itemdescription,
  }))

  return quotationDto(quotation.rows[0], mappedItems)
}

async function handleCreatePaymongoCheckout(req, res, userId, referenceNumber) {
  if (!(await requirePaymentTableReady(res))) return
  if (!paymongoSecretKey) return sendJson(res, 503, { error: 'PayMongo is not configured yet. Set PAYMONGO_SECRET_KEY in .env.' })

  const result = await transaction(async (client) => {
    await ensureUserExists(client, userId)
    const quotation = await loadPayableQuotation(client, userId, referenceNumber)
    if (!quotation) return { notFound: true }
    if (!quotation.canPay) return { notPayable: quotation }

    const activePayment = await client.query(
      `SELECT *
         FROM public.tbl_paymenttransaction
        WHERE v_userid = $1
          AND v_quotationid = (
            SELECT v_quotationid FROM public.tbl_quotation WHERE v_userid = $1 AND v_referencenumber = $2 LIMIT 1
          )
          AND v_status IN ('Pending', 'Paid')
        ORDER BY v_createdat DESC
        LIMIT 1`,
      [userId, referenceNumber],
    )
    if (activePayment.rowCount && activePayment.rows[0].v_status === 'Paid') return { alreadyPaid: activePayment.rows[0] }
    if (activePayment.rowCount && activePayment.rows[0].v_checkouturl) return { existing: activePayment.rows[0] }

    const paymentReference = transactionReference(referenceNumber)
    const inserted = await client.query(
      `INSERT INTO public.tbl_paymenttransaction
        (v_quotationid, v_userid, v_referencenumber, v_status, v_amount, v_currency)
       SELECT v_quotationid, v_userid, $3, 'Pending', $4, 'PHP'
         FROM public.tbl_quotation
        WHERE v_userid = $1
          AND v_referencenumber = $2
       RETURNING *`,
      [userId, referenceNumber, paymentReference, quotation.totalAmount],
    )

    const base = publicAppBase(req)
    const user = await client.query(
      `SELECT v_firstname, v_lastname, v_emailaddress, v_contactnumber
         FROM public.tbl_user
        WHERE v_userid = $1
        LIMIT 1`,
      [userId],
    )
    const customer = user.rows[0] || {}
    const customerName = [customer.v_firstname, customer.v_lastname].filter(Boolean).join(' ')

    const paymongo = await paymongoRequest('/v2/checkout_sessions', {
      method: 'POST',
      headers: { 'Idempotency-Key': paymentReference },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: checkoutLineItems(quotation),
            payment_method_types: paymongoMethods,
            success_url: `${base}/?payment_reference=${encodeURIComponent(paymentReference)}#products`,
            cancel_url: `${base}/?payment_cancelled=${encodeURIComponent(paymentReference)}#products`,
            reference_number: paymentReference,
            description: `Katala quotation ${referenceNumber}`,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            pass_on_fees: paymongoPassOnFees,
            billing: {
              name: customerName || undefined,
              email: customer.v_emailaddress || undefined,
              phone: customer.v_contactnumber || undefined,
            },
            metadata: {
              quotation_reference: referenceNumber,
              payment_reference: paymentReference,
              user_id: userId,
            },
          },
        },
      }),
    })

    const checkout = paymongo.data || {}
    const attributes = checkout.attributes || {}
    const updated = await client.query(
      `UPDATE public.tbl_paymenttransaction
          SET v_paymongo_checkoutsessionid = $2,
              v_checkouturl = $3,
              v_rawpayload = $4,
              v_updatedat = NOW()
        WHERE v_paymenttransactionid = $1
       RETURNING *`,
      [inserted.rows[0].v_paymenttransactionid, checkout.id || null, attributes.checkout_url || null, paymongo],
    )

    return { payment: updated.rows[0], checkoutUrl: attributes.checkout_url }
  })

  if (result.notFound) return sendJson(res, 404, { error: 'Quotation not found.' })
  if (result.notPayable) {
    return sendJson(res, 409, {
      error: 'This quotation is not ready for payment yet. It needs a positive item price before PayMongo checkout can start.',
      quotation: result.notPayable,
    })
  }
  if (result.alreadyPaid) return sendJson(res, 409, { error: 'This quotation has already been paid.', payment: paymentStatusDto(result.alreadyPaid) })
  if (!result.checkoutUrl && !result.existing?.v_checkouturl) return sendJson(res, 502, { error: 'PayMongo did not return a checkout URL.' })

  const payment = result.payment || result.existing
  return sendJson(res, 201, {
    ok: true,
    checkoutUrl: result.checkoutUrl || result.existing.v_checkouturl,
    payment: paymentStatusDto(payment),
  })
}

function verifyPaymongoSignature(rawBody, signatureHeader) {
  if (!paymongoWebhookSecret) return process.env.NODE_ENV !== 'production'
  if (!signatureHeader) return false
  const expected = createHmac('sha256', paymongoWebhookSecret).update(rawBody).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(String(signatureHeader).trim())
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function checkoutFromWebhook(payload) {
  return payload?.data?.data || payload?.data || null
}

function webhookEventType(payload) {
  return payload?.data?.type || payload?.data?.attributes?.type || payload?.type || ''
}

async function updatePaymentFromCheckout(checkout, rawPayload = null) {
  if (!checkout?.attributes) return null
  if (!(await paymentTableExists())) return null

  const attrs = checkout.attributes
  const payments = Array.isArray(attrs.payments) ? attrs.payments : []
  const paidPayment = payments.find((payment) => payment?.attributes?.status === 'paid') || payments[payments.length - 1]
  const paymentAttrs = paidPayment?.attributes || {}
  const status = paymentAttrs.status === 'paid' ? 'Paid' : (attrs.status === 'expired' ? 'Expired' : 'Pending')
  const paymentReference = attrs.reference_number || attrs.metadata?.payment_reference || null
  const sessionId = checkout.id || null
  if (!paymentReference && !sessionId) return null

  const result = await pool.query(
    `UPDATE public.tbl_paymenttransaction
        SET v_status = $3,
            v_paymongo_checkoutsessionid = COALESCE(v_paymongo_checkoutsessionid, $4),
            v_paymongo_paymentintentid = COALESCE($5, v_paymongo_paymentintentid),
            v_paymongo_paymentid = COALESCE($6, v_paymongo_paymentid),
            v_paymentmethod = COALESCE($7, v_paymentmethod),
            v_receiptnumber = CASE WHEN $3 = 'Paid' THEN COALESCE(v_receiptnumber, $8) ELSE v_receiptnumber END,
            v_paidat = CASE WHEN $3 = 'Paid' THEN COALESCE(v_paidat, NOW()) ELSE v_paidat END,
            v_billingname = COALESCE($9, v_billingname),
            v_billingemail = COALESCE($10, v_billingemail),
            v_billingphone = COALESCE($11, v_billingphone),
            v_rawpayload = COALESCE($12, v_rawpayload),
            v_amount = CASE WHEN $13::numeric IS NOT NULL AND $3 = 'Paid' THEN $13 ELSE v_amount END,
            v_updatedat = NOW()
      WHERE ($1::text IS NOT NULL AND v_referencenumber = $1)
         OR ($2::text IS NOT NULL AND v_paymongo_checkoutsessionid = $2)
      RETURNING *`,
    [
      paymentReference,
      sessionId,
      status,
      sessionId,
      attrs.payment_intent?.id || paymentAttrs.payment_intent_id || null,
      paidPayment?.id || null,
      paymentAttrs.source?.type || null,
      receiptNumber(),
      paymentAttrs.billing?.name || attrs.billing?.name || null,
      paymentAttrs.billing?.email || attrs.billing?.email || null,
      paymentAttrs.billing?.phone || attrs.billing?.phone || null,
      rawPayload,
      paymentAttrs.amount ? toMoneyNumber(Number(paymentAttrs.amount) / 100) : null,
    ],
  )
  return result.rows[0] || null
}

async function refreshPaymentFromPaymongo(payment) {
  if (!payment?.v_paymongo_checkoutsessionid || !paymongoSecretKey) return payment
  const paymongo = await paymongoRequest(`/v1/checkout_sessions/${encodeURIComponent(payment.v_paymongo_checkoutsessionid)}`, {
    method: 'GET',
  })
  return await updatePaymentFromCheckout(paymongo.data, paymongo) || payment
}

async function loadReceipt(userId, paymentReference) {
  const payment = await pool.query(
    `SELECT pt.*, q.v_referencenumber AS quotation_reference, q.v_projectname, q.v_establishmentname,
            q.v_projectaddress, q.v_additionalcost, q.v_quotationstatus,
            u.v_firstname, u.v_lastname, u.v_emailaddress, u.v_contactnumber
       FROM public.tbl_paymenttransaction pt
       JOIN public.tbl_quotation q ON q.v_quotationid = pt.v_quotationid
       JOIN public.tbl_user u ON u.v_userid = pt.v_userid
      WHERE pt.v_userid = $1
        AND pt.v_referencenumber = $2
      LIMIT 1`,
    [userId, paymentReference],
  )
  if (!payment.rowCount) return null
  const row = payment.rows[0]

  const items = await pool.query(
    `SELECT qpi.v_quantity, qpi.v_unitprice, qpi.v_itemdescription,
            pv.v_productcode, pv.v_productmodel, pv.v_productsize,
            p.v_productname
       FROM public.tbl_quotationproductitem qpi
       JOIN public.tbl_productvariant pv ON pv.v_productvariantid = qpi.v_productvariantid
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE qpi.v_quotationid = $1
      ORDER BY qpi.v_createdat`,
    [row.v_quotationid],
  )

  const lineItems = items.rows.map((item) => {
    const unitPrice = quotationUnitPrice(item.v_unitprice) || 0
    const quantity = Number(item.v_quantity || 0)
    return {
      productName: item.v_productname,
      productCode: item.v_productcode,
      productModel: item.v_productmodel,
      productSize: item.v_productsize,
      quantity,
      unitPrice,
      lineTotal: toMoneyNumber(unitPrice * quantity),
      itemDescription: item.v_itemdescription,
    }
  })

  return {
    payment: paymentStatusDto(row),
    receiptNumber: row.v_receiptnumber,
    quotationReference: row.quotation_reference,
    customerName: [row.v_firstname, row.v_lastname].filter(Boolean).join(' '),
    customerEmail: row.v_emailaddress,
    customerContactNumber: row.v_contactnumber,
    projectName: row.v_projectname,
    establishmentName: row.v_establishmentname,
    projectAddress: row.v_projectaddress,
    subtotal: toMoneyNumber(lineItems.reduce((sum, item) => sum + item.lineTotal, 0)),
    additionalCost: toMoneyNumber(row.v_additionalcost),
    totalAmount: toMoneyNumber(row.v_amount),
    currency: row.v_currency || 'PHP',
    paidAt: row.v_paidat,
    paymentMethod: row.v_paymentmethod,
    items: lineItems,
  }
}

async function handleGetReceipt(req, res, userId, paymentReference) {
  if (!(await requirePaymentTableReady(res))) return

  const payment = await pool.query(
    `SELECT *
       FROM public.tbl_paymenttransaction
      WHERE v_userid = $1
        AND v_referencenumber = $2
      LIMIT 1`,
    [userId, paymentReference],
  )
  if (!payment.rowCount) return sendJson(res, 404, { error: 'Payment transaction not found.' })

  if (payment.rows[0].v_status !== 'Paid') {
    await refreshPaymentFromPaymongo(payment.rows[0])
  }

  const receipt = await loadReceipt(userId, paymentReference)
  if (!receipt) return sendJson(res, 404, { error: 'Receipt not found.' })
  return sendJson(res, 200, { ok: true, receipt })
}

async function handlePaymongoWebhook(req, res) {
  if (!pool) return sendJson(res, 503, { error: 'Database is not connected.' })

  const rawBody = await readRawBody(req, 256_000)
  const signature = req.headers['paymongo-signature'] || req.headers['x-paymongo-signature']
  if (!verifyPaymongoSignature(rawBody, signature)) return sendJson(res, 401, { error: 'Invalid PayMongo signature.' })

  const payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
  const eventType = webhookEventType(payload)
  if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
    await updatePaymentFromCheckout(checkoutFromWebhook(payload), payload)
  }

  return sendJson(res, 200, { ok: true })
}

async function handleCreateServiceRequest(req, res, userId) {
  const body = await readBody(req)
  const serviceName = clean(body.serviceName, 180)
  if (!serviceName) return sendJson(res, 400, { error: 'Service name is required.' })

  const parsed = serviceRequestFields(body)
  if (parsed.error) return sendJson(res, 400, { error: parsed.error })
  const values = parsed.values
  const referenceNumber = createReference('SR')

  const result = await transaction(async (client) => {
    await ensureUserExists(client, userId)
    await verifyAddressOwnership(client, userId, values.userAddressId)
    const service = await resolveService(client, serviceName)

    const inserted = await client.query(
      `INSERT INTO public.tbl_servicerequest
        (v_userid, v_serviceid, v_useraddressid, v_referencenumber, v_projectname, v_establishmentname,
         v_contactperson, v_contactnumber, v_problemdescription, v_projectaddress, v_preferreddate,
         v_preferredtime, v_prioritylevel, v_customerremarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId,
        service.v_serviceid,
        values.userAddressId,
        referenceNumber,
        values.projectName,
        values.establishmentName,
        values.contactPerson,
        values.contactNumber,
        values.problemDescription,
        values.projectAddress,
        values.preferredDate,
        values.preferredTime,
        values.priorityLevel,
        values.customerRemarks,
      ],
    )

    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, 'Submitted', 'Submitted by customer')`,
      [inserted.rows[0].v_servicerequestid, userId],
    )

    return inserted.rows[0]
  })

  return sendJson(res, 201, {
    ok: true,
    referenceNumber: result.v_referencenumber,
    status: result.v_requeststatus,
    message: 'Service request submitted for review.',
  })
}

function serviceRequestDto(row, serviceName) {
  return {
    referenceNumber: row.v_referencenumber,
    serviceName,
    projectName: row.v_projectname,
    establishmentName: row.v_establishmentname,
    contactPerson: row.v_contactperson,
    contactNumber: row.v_contactnumber,
    problemDescription: row.v_problemdescription,
    projectAddress: row.v_projectaddress,
    preferredDate: row.v_preferreddate,
    preferredTime: row.v_preferredtime,
    priorityLevel: row.v_prioritylevel,
    customerRemarks: row.v_customerremarks,
    status: row.v_requeststatus,
    submittedAt: row.v_submittedat,
    updatedAt: row.v_updatedat,
  }
}

async function loadServiceRequest(userId, referenceNumber) {
  const result = await pool.query(
    `SELECT sr.*, s.v_servicename
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
      WHERE sr.v_userid = $1 AND sr.v_referencenumber = $2
      LIMIT 1`,
    [userId, referenceNumber],
  )
  if (!result.rowCount) return null
  return serviceRequestDto(result.rows[0], result.rows[0].v_servicename)
}

async function handleGetServiceRequest(req, res, userId, referenceNumber) {
  const serviceRequest = await loadServiceRequest(userId, referenceNumber)
  if (!serviceRequest) return sendJson(res, 404, { error: 'Service request not found.' })
  return sendJson(res, 200, { ok: true, serviceRequest })
}

async function handleUpdateServiceRequest(req, res, userId, referenceNumber) {
  const body = await readBody(req)
  const parsed = serviceRequestFields(body)
  if (parsed.error) return sendJson(res, 400, { error: parsed.error })
  const values = parsed.values

  const result = await transaction(async (client) => {
    await verifyAddressOwnership(client, userId, values.userAddressId)
    const updated = await client.query(
      `UPDATE public.tbl_servicerequest
          SET v_useraddressid = $3,
              v_projectname = $4,
              v_establishmentname = $5,
              v_contactperson = $6,
              v_contactnumber = $7,
              v_problemdescription = $8,
              v_projectaddress = $9,
              v_preferreddate = $10,
              v_preferredtime = $11,
              v_prioritylevel = $12,
              v_customerremarks = $13,
              v_updatedat = NOW()
        WHERE v_userid = $1
          AND v_referencenumber = $2
          AND v_requeststatus IN ('Submitted', 'Under Review', 'Awaiting Customer Confirmation')
        RETURNING *`,
      [
        userId,
        referenceNumber,
        values.userAddressId,
        values.projectName,
        values.establishmentName,
        values.contactPerson,
        values.contactNumber,
        values.problemDescription,
        values.projectAddress,
        values.preferredDate,
        values.preferredTime,
        values.priorityLevel,
        values.customerRemarks,
      ],
    )
    return updated.rows[0] || null
  })

  if (!result) {
    const existing = await pool.query(
      'SELECT v_requeststatus FROM public.tbl_servicerequest WHERE v_userid = $1 AND v_referencenumber = $2 LIMIT 1',
      [userId, referenceNumber],
    )
    if (!existing.rowCount) return sendJson(res, 404, { error: 'Service request not found.' })
    return sendJson(res, 409, { error: `Service request can no longer be edited because its status is ${existing.rows[0].v_requeststatus}.` })
  }

  const serviceRequest = await loadServiceRequest(userId, referenceNumber)
  return sendJson(res, 200, { ok: true, serviceRequest })
}

async function handleCancelServiceRequest(req, res, userId, referenceNumber) {
  const result = await transaction(async (client) => {
    const request = await client.query(
      `SELECT * FROM public.tbl_servicerequest
        WHERE v_userid = $1 AND v_referencenumber = $2
        FOR UPDATE`,
      [userId, referenceNumber],
    )
    if (!request.rowCount) return { notFound: true }

    const row = request.rows[0]
    if (['Completed', 'Rejected', 'Cancelled'].includes(row.v_requeststatus)) return { blocked: row.v_requeststatus }

    await client.query(
      `UPDATE public.tbl_servicerequest
          SET v_requeststatus = 'Cancelled', v_updatedat = NOW()
        WHERE v_servicerequestid = $1`,
      [row.v_servicerequestid],
    )
    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, 'Cancelled', 'Cancelled by customer')`,
      [row.v_servicerequestid, userId],
    )
    return { cancelled: true }
  })

  if (result.notFound) return sendJson(res, 404, { error: 'Service request not found.' })
  if (result.blocked) return sendJson(res, 409, { error: `Service request cannot be cancelled because its status is ${result.blocked}.` })
  return sendJson(res, 200, { ok: true, message: 'Service request cancelled.' })
}

async function handleCustomerInbox(req, res, userId) {
  const quoteRefs = await pool.query(
    `SELECT v_referencenumber
       FROM public.tbl_quotation
      WHERE v_userid = $1
      ORDER BY v_submittedat DESC
      LIMIT 50`,
    [userId],
  )
  const quotations = []
  for (const row of quoteRefs.rows) {
    const quotation = await loadQuotation(userId, row.v_referencenumber)
    if (quotation) quotations.push(quotation)
  }

  const services = await pool.query(
    `SELECT sr.*, s.v_servicename
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
      WHERE sr.v_userid = $1
      ORDER BY sr.v_submittedat DESC
      LIMIT 50`,
    [userId],
  )

  return sendJson(res, 200, {
    ok: true,
    quotations,
    serviceRequests: services.rows.map((row) => serviceRequestDto(row, row.v_servicename)),
  })
}

async function staffQuotationRows() {
  const result = await pool.query(
    `SELECT q.*, u.v_firstname, u.v_lastname, u.v_emailaddress, u.v_companyname, u.v_contactnumber
       FROM public.tbl_quotation q
       JOIN public.tbl_user u ON u.v_userid = q.v_userid
      ORDER BY q.v_submittedat DESC
      LIMIT 100`,
  )
  return result.rows
}

async function staffServiceRows() {
  const result = await pool.query(
    `SELECT sr.*, s.v_servicename, u.v_firstname, u.v_lastname, u.v_emailaddress, u.v_companyname, u.v_contactnumber
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
       JOIN public.tbl_user u ON u.v_userid = sr.v_userid
      ORDER BY sr.v_submittedat DESC
      LIMIT 100`,
  )
  return result.rows
}

function customerName(row) {
  return [row.v_firstname, row.v_lastname].filter(Boolean).join(' ') || row.v_companyname || row.v_emailaddress || 'Customer'
}

async function handleStaffWorkQueue(req, res) {
  const [quotations, serviceRequests] = await Promise.all([staffQuotationRows(), staffServiceRows()])
  const items = [
    ...quotations.map((row) => ({
      id: row.v_referencenumber,
      kind: 'Quotation',
      customer: customerName(row),
      company: row.v_companyname || '',
      email: row.v_emailaddress || '',
      contactNumber: row.v_contactnumber || '',
      subject: row.v_projectname || row.v_establishmentname || 'Product quotation',
      status: row.v_quotationstatus,
      priority: 'Normal',
      submittedAt: row.v_submittedat,
      updatedAt: row.v_updatedat,
      projectAddress: row.v_projectaddress,
      customerRemarks: row.v_customerremarks,
      totalAmount: toMoneyNumber(row.v_additionalcost),
    })),
    ...serviceRequests.map((row) => ({
      id: row.v_referencenumber,
      kind: 'Service',
      customer: customerName(row),
      company: row.v_companyname || '',
      email: row.v_emailaddress || '',
      contactNumber: row.v_contactnumber || '',
      subject: row.v_servicename,
      status: row.v_requeststatus,
      priority: row.v_prioritylevel || 'Normal',
      submittedAt: row.v_submittedat,
      updatedAt: row.v_updatedat,
      projectAddress: row.v_projectaddress,
      preferredDate: row.v_preferreddate,
      preferredTime: row.v_preferredtime,
      customerRemarks: row.v_customerremarks,
      problemDescription: row.v_problemdescription,
    })),
  ].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))

  return sendJson(res, 200, { ok: true, items })
}

async function handleStaffUpdateQuotation(req, res, staffUser, referenceNumber) {
  const body = await readBody(req)
  const status = clean(body.status, 80) || 'Under Review'
  const additionalCost = body.additionalCost === '' || body.additionalCost === null || body.additionalCost === undefined
    ? null
    : toMoneyNumber(body.additionalCost)
  const validUntil = nullable(body.validUntil, 20)
  const remarks = nullable(body.remarks, 1000)

  const result = await transaction(async (client) => {
    const updated = await client.query(
      `UPDATE public.tbl_quotation
          SET v_quotationstatus = $2,
              v_additionalcost = COALESCE($3, v_additionalcost),
              v_validuntil = COALESCE($4::date, v_validuntil),
              v_updatedat = NOW()
        WHERE v_referencenumber = $1
        RETURNING *`,
      [referenceNumber, status, additionalCost, validUntil],
    )
    if (!updated.rowCount) return null
    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, $4)`,
      [updated.rows[0].v_quotationid, staffUser.id, status, remarks || `Updated by ${staffUser.role}`],
    )
    return updated.rows[0]
  })

  if (!result) return sendJson(res, 404, { error: 'Quotation not found.' })
  const quotation = await loadQuotation(result.v_userid, referenceNumber)
  return sendJson(res, 200, { ok: true, quotation })
}

async function handleStaffUpdateServiceRequest(req, res, staffUser, referenceNumber) {
  const body = await readBody(req)
  const status = clean(body.status, 80) || 'Under Review'
  const preferredDate = nullable(body.preferredDate, 20)
  const preferredTime = normalizePreferredTime(nullable(body.preferredTime, 20))
  const remarks = nullable(body.remarks, 1000)
  const scheduleError = validatePreferredSchedule(preferredDate, preferredTime)
  if (scheduleError) return sendJson(res, 400, { error: scheduleError })

  const result = await transaction(async (client) => {
    const updated = await client.query(
      `UPDATE public.tbl_servicerequest
          SET v_requeststatus = $2,
              v_preferreddate = COALESCE($3::date, v_preferreddate),
              v_preferredtime = COALESCE($4::time, v_preferredtime),
              v_updatedat = NOW()
        WHERE v_referencenumber = $1
        RETURNING *`,
      [referenceNumber, status, preferredDate, preferredTime],
    )
    if (!updated.rowCount) return null
    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, $4)`,
      [updated.rows[0].v_servicerequestid, staffUser.id, status, remarks || `Updated by ${staffUser.role}`],
    )
    return updated.rows[0]
  })

  if (!result) return sendJson(res, 404, { error: 'Service request not found.' })
  const serviceRequest = await loadServiceRequest(result.v_userid, referenceNumber)
  return sendJson(res, 200, { ok: true, serviceRequest })
}

async function handleListMaterials(req, res) {
  return sendJson(res, 200, { ok: true, materials: await listMaterials() })
}

async function handleCreateMaterial(req, res) {
  const body = await readBody(req)
  const name = clean(body.name, 180)
  const sku = clean(body.sku, 80)
  if (!name || !sku) return sendJson(res, 400, { error: 'Material name and SKU are required.' })

  await transaction(async (client) => {
    const productColumns = await tableColumns('tbl_product', client)
    const variantColumns = await tableColumns('tbl_productvariant', client)
    const categoryColumn = firstColumn(productColumns, ['v_productcategory', 'v_category', 'v_producttype'])
    const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
    const reorderColumn = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])

    const productInsert = buildInsert('tbl_product', {
      v_productname: name,
      v_isactive: true,
      ...(categoryColumn ? { [categoryColumn]: nullable(body.category, 120) } : {}),
    })
    const product = await client.query(productInsert.sql, productInsert.params)

    const variantInsert = buildInsert('tbl_productvariant', {
      v_productid: product.rows[0].v_productid,
      v_productcode: sku,
      v_productmodel: nullable(body.model, 120) || sku,
      v_productsize: nullable(body.size, 80),
      v_productunit: nullable(body.unit, 40) || 'unit',
      v_isactive: true,
      ...(stockColumn ? { [stockColumn]: Number(body.stock || 0) } : {}),
      ...(reorderColumn ? { [reorderColumn]: Number(body.reorderLevel || 0) } : {}),
    })
    await client.query(variantInsert.sql, variantInsert.params)
  })

  return sendJson(res, 201, { ok: true, materials: await listMaterials() })
}

async function handleUpdateMaterial(req, res, variantId) {
  if (!isUuid(variantId)) return sendJson(res, 400, { error: 'Invalid material id.' })
  const body = await readBody(req)
  await transaction(async (client) => {
    const variant = await client.query(
      'SELECT v_productid FROM public.tbl_productvariant WHERE v_productvariantid = $1 LIMIT 1',
      [variantId],
    )
    if (!variant.rowCount) {
      const error = new Error('MATERIAL_NOT_FOUND')
      error.statusCode = 404
      throw error
    }

    const productColumns = await tableColumns('tbl_product', client)
    const variantColumns = await tableColumns('tbl_productvariant', client)
    const categoryColumn = firstColumn(productColumns, ['v_productcategory', 'v_category', 'v_producttype'])
    const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
    const reorderColumn = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])

    const productUpdate = buildUpdate('tbl_product', 'v_productid', variant.rows[0].v_productid, {
      v_productname: body.name === undefined ? undefined : clean(body.name, 180),
      ...(categoryColumn && body.category !== undefined ? { [categoryColumn]: nullable(body.category, 120) } : {}),
      ...(productColumns.has('v_updatedat') ? { v_updatedat: new Date() } : {}),
    })
    if (productUpdate) await client.query(productUpdate.sql, productUpdate.params)

    const variantUpdate = buildUpdate('tbl_productvariant', 'v_productvariantid', variantId, {
      v_productcode: body.sku === undefined ? undefined : clean(body.sku, 80),
      v_productmodel: body.model === undefined ? undefined : nullable(body.model, 120),
      v_productsize: body.size === undefined ? undefined : nullable(body.size, 80),
      v_productunit: body.unit === undefined ? undefined : nullable(body.unit, 40),
      v_isactive: body.active === undefined ? undefined : Boolean(body.active),
      ...(stockColumn && body.stock !== undefined ? { [stockColumn]: Number(body.stock || 0) } : {}),
      ...(reorderColumn && body.reorderLevel !== undefined ? { [reorderColumn]: Number(body.reorderLevel || 0) } : {}),
      ...(variantColumns.has('v_updatedat') ? { v_updatedat: new Date() } : {}),
    })
    if (variantUpdate) await client.query(variantUpdate.sql, variantUpdate.params)
  })
  return sendJson(res, 200, { ok: true, materials: await listMaterials() })
}

async function handleDeleteMaterial(req, res, variantId) {
  if (!isUuid(variantId)) return sendJson(res, 400, { error: 'Invalid material id.' })
  const result = await pool.query(
    `UPDATE public.tbl_productvariant
        SET v_isactive = FALSE
      WHERE v_productvariantid = $1
      RETURNING *`,
    [variantId],
  )
  if (!result.rowCount) return sendJson(res, 404, { error: 'Material not found.' })
  return sendJson(res, 200, { ok: true, materials: await listMaterials() })
}

async function handleListServices(req, res) {
  return sendJson(res, 200, { ok: true, services: await listServices() })
}

async function handleCreateServiceAdmin(req, res) {
  const body = await readBody(req)
  const name = clean(body.name, 180)
  const code = clean(body.code, 80)
  if (!name || !code) return sendJson(res, 400, { error: 'Service name and code are required.' })

  const columns = await tableColumns('tbl_service')
  const categoryColumn = firstColumn(columns, ['v_servicecategory', 'v_category'])
  const durationColumn = firstColumn(columns, ['v_estimatedduration', 'v_duration'])
  const descriptionColumn = firstColumn(columns, ['v_servicedescription', 'v_description'])
  const insert = buildInsert('tbl_service', {
    v_servicecode: code,
    v_servicename: name,
    v_isactive: Boolean(body.active ?? true),
    ...(categoryColumn ? { [categoryColumn]: nullable(body.category, 120) } : {}),
    ...(durationColumn ? { [durationColumn]: nullable(body.duration, 120) } : {}),
    ...(descriptionColumn ? { [descriptionColumn]: nullable(body.description, 1200) } : {}),
  })
  await pool.query(insert.sql, insert.params)
  return sendJson(res, 201, { ok: true, services: await listServices() })
}

async function handleUpdateServiceAdmin(req, res, serviceId) {
  if (!isUuid(serviceId)) return sendJson(res, 400, { error: 'Invalid service id.' })
  const body = await readBody(req)
  const columns = await tableColumns('tbl_service')
  const categoryColumn = firstColumn(columns, ['v_servicecategory', 'v_category'])
  const durationColumn = firstColumn(columns, ['v_estimatedduration', 'v_duration'])
  const descriptionColumn = firstColumn(columns, ['v_servicedescription', 'v_description'])
  const update = buildUpdate('tbl_service', 'v_serviceid', serviceId, {
    v_servicecode: body.code === undefined ? undefined : clean(body.code, 80),
    v_servicename: body.name === undefined ? undefined : clean(body.name, 180),
    v_isactive: body.active === undefined ? undefined : Boolean(body.active),
    ...(categoryColumn && body.category !== undefined ? { [categoryColumn]: nullable(body.category, 120) } : {}),
    ...(durationColumn && body.duration !== undefined ? { [durationColumn]: nullable(body.duration, 120) } : {}),
    ...(descriptionColumn && body.description !== undefined ? { [descriptionColumn]: nullable(body.description, 1200) } : {}),
    ...(columns.has('v_updatedat') ? { v_updatedat: new Date() } : {}),
  })
  if (update) {
    const result = await pool.query(update.sql, update.params)
    if (!result.rowCount) return sendJson(res, 404, { error: 'Service not found.' })
  }
  return sendJson(res, 200, { ok: true, services: await listServices() })
}

async function handleDeleteServiceAdmin(req, res, serviceId) {
  if (!isUuid(serviceId)) return sendJson(res, 400, { error: 'Invalid service id.' })
  const result = await pool.query(
    `UPDATE public.tbl_service
        SET v_isactive = FALSE
      WHERE v_serviceid = $1
      RETURNING *`,
    [serviceId],
  )
  if (!result.rowCount) return sendJson(res, 404, { error: 'Service not found.' })
  return sendJson(res, 200, { ok: true, services: await listServices() })
}

function friendlyDatabaseError(error) {
  if (error.message === 'PAYMONGO_NOT_CONFIGURED') return 'PayMongo is not configured yet. Set PAYMONGO_SECRET_KEY in .env.'
  if (error.message === 'PAYMONGO_API_ERROR') return error.publicMessage || 'PayMongo rejected the payment request.'
  if (error.message === 'AUTH_SCHEMA_INCOMPATIBLE') return 'Account access is not fully configured yet. Please contact the site administrator.'
  if (error.message === 'AUTH_SCHEMA_REQUIRED_FIELDS') return 'Account creation needs additional server-side configuration. Please contact the site administrator.'
  if (error.message === 'EMAIL_ALREADY_REGISTERED') return 'An account already exists for that email address.'
  if (error.message === 'USER_NOT_FOUND') return 'Your verified login could not be matched to a Katala customer profile.'
  if (error.message === 'ACCOUNT_NOT_ACTIVE') return 'Verify your email before submitting quotations or service requests.'
  if (error.message === 'PRODUCT_VARIANT_NOT_FOUND') return `The selected product option is not available for online quotation yet: ${error.item?.productName || 'product'}${error.item?.productSize ? ` / ${error.item.productSize}` : ''}. Please contact Katala for assistance.`
  if (error.message === 'PRODUCT_VARIANT_AMBIGUOUS') return 'This product option needs manual review before it can be quoted. Please contact Katala.'
  if (error.message === 'MATERIAL_NOT_FOUND') return 'Material not found.'
  if (error.message === 'INSUFFICIENT_STOCK') return `Only ${error.stock} unit(s) are currently available for ${error.item?.productName || 'that material'}. Please lower the quantity or contact Katala.`
  if (error.message === 'SERVICE_NOT_FOUND') return 'This service is not available for online requests yet. Please contact Katala directly.'
  if (error.message === 'SERVICE_AMBIGUOUS') return 'This service requires administrator review before online requests can be accepted.'
  if (error.message === 'ADDRESS_NOT_OWNED') return 'The selected saved address is not available for this account.'
  if (error.code === '42P01') return 'A required service is not configured on the server yet.'
  if (error.code === '23503') return 'A required record could not be found. Please refresh and try again.'
  if (error.code === '23505') return 'That information already exists. Please review your entry and try again.'
  if (error.code === '28P01') return 'The database rejected the configured credentials. Check DATABASE_URL in .env.'
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) return 'The API could not reach the database. Check DATABASE_URL and your network connection.'
  return null
}

async function reportDatabaseReadiness() {
  if (!pool) return

  try {
    await pool.query('SELECT 1')
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.tbl_productvariant WHERE v_isactive = TRUE) AS product_variants,
        (SELECT COUNT(*)::int FROM public.tbl_service WHERE v_isactive = TRUE) AS services
    `)

    const counts = result.rows[0] || {}
    console.log('Database connection: verified')
    console.log(`Catalog readiness: ${counts.product_variants || 0} active product variant(s), ${counts.services || 0} active service(s)`)

    if (!counts.product_variants || !counts.services) {
      console.warn('Catalog/service data is incomplete. Run katala_catalog_service_seed.sql in Supabase before testing quotation/service submissions.')
    }
  } catch (error) {
    console.error('Database connection check failed:', error.message)
  }
}

const server = http.createServer(async (req, res) => {
  setCors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  if (isRateLimited(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again in a minute.' })

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const quotationMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)$/)
  const quotationCheckoutMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/paymongo-checkout$/)
  const serviceRequestMatch = url.pathname.match(/^\/api\/service-requests\/([^/]+)$/)
  const staffQuotationMatch = url.pathname.match(/^\/api\/staff\/quotations\/([^/]+)$/)
  const staffServiceRequestMatch = url.pathname.match(/^\/api\/staff\/service-requests\/([^/]+)$/)
  const adminMaterialMatch = url.pathname.match(/^\/api\/admin\/materials\/([^/]+)$/)
  const adminServiceMatch = url.pathname.match(/^\/api\/admin\/services\/([^/]+)$/)
  const adminAccountMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/)

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        databaseConfigured: Boolean(pool),
        supabaseAuthConfigured: Boolean(supabaseAuth),
        paymongoConfigured: Boolean(paymongoSecretKey),
        message: pool && supabaseAuth
          ? 'API, database, and Supabase Auth are configured.'
          : 'Configuration is incomplete. Check DATABASE_URL and Supabase environment variables.',
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/paymongo/webhook') {
      return await handlePaymongoWebhook(req, res)
    }

    if (url.pathname.startsWith('/api/')) {
      if (!requireDatabase(res)) return

      if (req.method === 'GET' && url.pathname === '/api/catalog/materials') {
        const materials = (await listMaterials()).filter((item) => item.active)
        return sendJson(res, 200, { ok: true, materials })
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/register-profile') {
        return await handleRegisterProfile(req, res)
      }

      if (url.pathname.startsWith('/api/admin/')) {
        const adminUser = await requirePortalUser(req, res, ['admin'])
        if (!adminUser) return

        if (req.method === 'GET' && url.pathname === '/api/admin/accounts') return await handleListAccounts(req, res)
        if (adminAccountMatch && req.method === 'PATCH') return await handleUpdateAccount(req, res, decodeURIComponent(adminAccountMatch[1]))
        if (req.method === 'GET' && url.pathname === '/api/admin/database-backup') return await handleDatabaseBackup(req, res)

        if (req.method === 'GET' && url.pathname === '/api/admin/materials') return await handleListMaterials(req, res)
        if (req.method === 'POST' && url.pathname === '/api/admin/materials') return await handleCreateMaterial(req, res)
        if (adminMaterialMatch && req.method === 'PATCH') return await handleUpdateMaterial(req, res, decodeURIComponent(adminMaterialMatch[1]))
        if (adminMaterialMatch && req.method === 'DELETE') return await handleDeleteMaterial(req, res, decodeURIComponent(adminMaterialMatch[1]))

        if (req.method === 'GET' && url.pathname === '/api/admin/services') return await handleListServices(req, res)
        if (req.method === 'POST' && url.pathname === '/api/admin/services') return await handleCreateServiceAdmin(req, res)
        if (adminServiceMatch && req.method === 'PATCH') return await handleUpdateServiceAdmin(req, res, decodeURIComponent(adminServiceMatch[1]))
        if (adminServiceMatch && req.method === 'DELETE') return await handleDeleteServiceAdmin(req, res, decodeURIComponent(adminServiceMatch[1]))
      }

      if (url.pathname.startsWith('/api/staff/')) {
        const staffUser = await requirePortalUser(req, res, ['staff', 'admin'])
        if (!staffUser) return

        if (req.method === 'GET' && url.pathname === '/api/staff/work-queue') return await handleStaffWorkQueue(req, res)
        if (staffQuotationMatch && req.method === 'PATCH') return await handleStaffUpdateQuotation(req, res, staffUser, decodeURIComponent(staffQuotationMatch[1]))
        if (staffServiceRequestMatch && req.method === 'PATCH') return await handleStaffUpdateServiceRequest(req, res, staffUser, decodeURIComponent(staffServiceRequestMatch[1]))
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/portal-session') {
        const portalUser = await requirePortalUser(req, res, ['customer', 'staff', 'admin'])
        if (!portalUser) return
        return await handlePortalSession(req, res, portalUser)
      }

      if (req.method === 'PATCH' && url.pathname === '/api/auth/profile') {
        const portalUser = await requirePortalUser(req, res, ['customer', 'staff', 'admin'])
        if (!portalUser) return
        return await handleUpdateOwnProfile(req, res, portalUser)
      }

      const customerUser = await requireCustomer(req, res)
      if (!customerUser) return
      const userId = customerUser.id

      if (req.method === 'GET' && url.pathname === '/api/auth/session') return await handleSession(req, res, customerUser)
      if (req.method === 'GET' && url.pathname === '/api/customer/inbox') return await handleCustomerInbox(req, res, userId)

      if (req.method === 'POST' && url.pathname === '/api/quotations') return await handleCreateQuotation(req, res, userId)
      if (quotationCheckoutMatch && req.method === 'POST') return await handleCreatePaymongoCheckout(req, res, userId, decodeURIComponent(quotationCheckoutMatch[1]))
      if (quotationMatch && req.method === 'GET') return await handleGetQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'PATCH') return await handleUpdateQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'DELETE') return await handleCancelQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))

      const receiptMatch = url.pathname.match(/^\/api\/payments\/([^/]+)\/receipt$/)
      if (receiptMatch && req.method === 'GET') return await handleGetReceipt(req, res, userId, decodeURIComponent(receiptMatch[1]))

      if (req.method === 'POST' && url.pathname === '/api/service-requests') return await handleCreateServiceRequest(req, res, userId)
      if (serviceRequestMatch && req.method === 'GET') return await handleGetServiceRequest(req, res, userId, decodeURIComponent(serviceRequestMatch[1]))
      if (serviceRequestMatch && req.method === 'PATCH') return await handleUpdateServiceRequest(req, res, userId, decodeURIComponent(serviceRequestMatch[1]))
      if (serviceRequestMatch && req.method === 'DELETE') return await handleCancelServiceRequest(req, res, userId, decodeURIComponent(serviceRequestMatch[1]))

      return sendJson(res, 404, { error: 'API endpoint not found.' })
    }

    return sendJson(res, 404, { error: 'Not found.' })
  } catch (error) {
    console.error(error)
    if (error.message === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Submission is too large.' })
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Invalid JSON request body.' })
    const friendly = friendlyDatabaseError(error)
    return sendJson(res, error.statusCode || 500, { error: friendly || 'Server/database error. No table was created or altered.' })
  }
})

server.listen(port, () => {
  console.log(`Katala API running on http://localhost:${port}`)
  console.log(pool ? 'Database connection: configured' : 'Database connection: not configured')
  console.log(supabaseAuth ? 'Supabase Auth verification: configured' : 'Supabase Auth verification: not configured')
  void reportDatabaseReadiness()
})
