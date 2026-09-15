import 'dotenv/config'
import http from 'node:http'
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import mysql from 'mysql2/promise'

const scrypt = promisify(scryptCallback)
const port = Number(process.env.PORT || 3001)
const mysqlConfig = {
  host: (process.env.DB_HOST || '').trim(),
  port: Number(process.env.DB_PORT || 3306),
  database: (process.env.DB_NAME || '').trim(),
  user: (process.env.DB_USER || '').trim(),
  password: process.env.DB_PASSWORD || '',
  timezone: (process.env.DB_TIMEZONE || '+08:00').trim(),
}
const useMysql = Boolean(mysqlConfig.host && mysqlConfig.database && mysqlConfig.user)
const appOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/$/, '')
const paymongoSecretKey = (process.env.PAYMONGO_SECRET_KEY || '').trim()
const paymongoWebhookSecret = (process.env.PAYMONGO_WEBHOOK_SECRET || '').trim()
const paymongoMethods = (process.env.PAYMONGO_PAYMENT_METHODS || 'card,gcash,qrph')
  .split(',')
  .map((method) => method.trim())
  .filter(Boolean)
const paymongoPassOnFees = String(process.env.PAYMONGO_PASS_ON_FEES || '').toLowerCase() === 'true'
const xenditSecretKey = (process.env.XENDIT_SECRET_KEY || '').trim()
const xenditWebhookToken = (process.env.XENDIT_WEBHOOK_TOKEN || '').trim()
const xenditPaymentChannels = (process.env.XENDIT_PAYMENT_CHANNELS || 'CARDS,GCASH,PAYMAYA,QRPH')
  .split(',')
  .map((channel) => channel.trim().toUpperCase())
  .filter(Boolean)

function mysqlPlaceholders(sql, params = []) {
  const nextParams = []
  let nextSql = sql
    .replaceAll('public.', '')
    .replace(/SELECT DISTINCT ON\s*\([^)]+\)/gi, 'SELECT')
    .replace(/::(?:varchar|text|uuid|date|time|numeric|int|integer)\b/gi, '')
    .replace(/COUNT\(\*\)::int/gi, 'COUNT(*)')
    .replace(/row_to_json\(t\) AS row_data/gi, 'JSON_OBJECT() AS row_data')
    .replace(/to_regclass\('tbl_paymenttransaction'\)/gi, "'tbl_paymenttransaction'")
    .replace(/to_regclass\('public\.tbl_paymenttransaction'\)/gi, "'tbl_paymenttransaction'")

  nextSql = nextSql.replace(/=\s*ANY\(\$(\d+)[^)]*\)/gi, (_match, indexText) => {
    const values = Array.isArray(params[Number(indexText) - 1]) ? params[Number(indexText) - 1] : []
    if (!values.length) return 'IN (NULL)'
    nextParams.push(...values)
    return `IN (${values.map(() => '?').join(', ')})`
  })

  nextSql = nextSql.replace(/\$(\d+)/g, (_match, indexText) => {
    nextParams.push(params[Number(indexText) - 1])
    return '?'
  })

  return { sql: nextSql, params: nextParams }
}

function normalizeMysqlRow(row) {
  if (!row || typeof row !== 'object') return row
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
  )
}

function mysqlResult(rows, info = {}) {
  const normalizedRows = Array.isArray(rows) ? rows.map(normalizeMysqlRow) : []
  return {
    rows: normalizedRows,
    rowCount: normalizedRows.length || Number(info.affectedRows || 0),
    insertId: info.insertId || null,
  }
}

function mysqlInsertUuid(sql) {
  if (!useMysql) return sql
  const match = sql.match(/^(\s*INSERT\s+INTO\s+(?:public\.)?)(\w+)(\s*\()([^)]*)(\)\s*)(VALUES|SELECT)\b/i)
  if (!match) return sql
  const idColumn = tableIdColumn(match[2])
  if (!idColumn) return sql
  const columns = match[4].split(',').map((item) => item.trim().toLowerCase())
  if (columns.includes(idColumn.toLowerCase())) return sql

  if (match[6].toUpperCase() === 'VALUES') {
    return sql.replace(
      /^(\s*INSERT\s+INTO\s+(?:public\.)?\w+\s*\()([^)]*)(\)\s*VALUES\s*\()/i,
      `$1${idColumn}, $2$3UUID(), `,
    )
  }

  if (match[6].toUpperCase() === 'SELECT') {
    return sql.replace(
      /^(\s*INSERT\s+INTO\s+(?:public\.)?\w+\s*\()([^)]*)(\)\s*SELECT\s+)/i,
      `$1${idColumn}, $2) SELECT UUID(), `,
    )
  }

  return sql
}

class MysqlConnection {
  constructor(connection) {
    this.connection = connection
  }

  async query(sql, params = []) {
    const returning = sql.match(/\s+RETURNING\s+(.+)$/is)
    const originalSql = sql
    if (returning) sql = sql.slice(0, returning.index)
    sql = mysqlInsertUuid(sql)
    const converted = mysqlPlaceholders(sql, params)
    const command = converted.sql.trim().toUpperCase()
    const [rows, info] = ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command)
      ? await this.connection.query(converted.sql)
      : await this.connection.execute(converted.sql, converted.params)

    if (returning) {
      const selected = await this.selectReturning(originalSql, params, returning[1])
      return selected || mysqlResult(rows, info)
    }

    return mysqlResult(rows, info)
  }

  async selectReturning(originalSql, params, returningColumns) {
    const insertMatch = originalSql.match(/INSERT\s+INTO\s+(?:public\.)?(\w+)\s*\(([^)]+)\)/i)
    if (insertMatch) {
      const table = insertMatch[1]
      const columns = insertMatch[2].split(',').map((item) => item.trim())
      const identityColumns = [`v_${table.replace(/^tbl_/, '')}id`, 'v_userid', 'v_referencenumber', 'v_emailaddress']
      const identityColumn = identityColumns.find((column) => columns.includes(column))
      if (identityColumn) {
        const value = params[columns.indexOf(identityColumn)]
        return await this.query(`SELECT ${returningColumns} FROM ${table} WHERE ${identityColumn} = $1 LIMIT 1`, [value])
      }
    }

    const updateMatch = originalSql.match(/UPDATE\s+(?:public\.)?(\w+)\s+SET\s+[\s\S]+?\s+WHERE\s+([\s\S]+?)\s+RETURNING/i)
    if (updateMatch) {
      const table = updateMatch[1]
      const whereClause = updateMatch[2]
      const placeholderCount = (whereClause.match(/\$\d+/g) || []).length
      const ordered = [...whereClause.matchAll(/\$(\d+)/g)].map((match) => params[Number(match[1]) - 1])
      const whereParams = ordered.length ? ordered : params.slice(-placeholderCount)
      return await this.query(`SELECT ${returningColumns} FROM ${table} WHERE ${whereClause} LIMIT 1`, whereParams)
    }

    return null
  }

  async release() {
    this.connection.release()
  }
}

class MysqlPool {
  constructor(config) {
    this.pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      timezone: config.timezone || '+08:00',
    })
  }

  async query(sql, params = []) {
    const connection = await this.pool.getConnection()
    try {
      return await new MysqlConnection(connection).query(sql, params)
    } finally {
      connection.release()
    }
  }

  async connect() {
    return new MysqlConnection(await this.pool.getConnection())
  }
}

const pool = useMysql ? new MysqlPool(mysqlConfig) : null

const requestLog = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000

function rateLimitPolicy(req, url) {
  if (req.method === 'OPTIONS') return null
  if (url.pathname === '/api/health') return null

  if (url.pathname === '/api/auth/portal-session') {
    return { limit: 120, scope: 'auth-session' }
  }
  if (url.pathname.startsWith('/api/auth/')) {
    return { limit: 60, scope: 'auth' }
  }
  if (req.method === 'GET') {
    return { limit: 180, scope: 'read' }
  }
  return { limit: 80, scope: 'write' }
}

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
  if (typeof value !== 'string') return ''

  let sanitized = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    sanitized += code <= 31 || code === 127 ? ' ' : character
  }
  return sanitized.trim().slice(0, max)
}

function nullable(value, max = 500) {
  const result = clean(value, max)
  return result || null
}

function nullableMoney(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? toMoneyNumber(number) : null
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isRateLimited(req, url) {
  const policy = rateLimitPolicy(req, url)
  if (!policy) return false

  const now = Date.now()
  const ip = req.socket.remoteAddress || 'unknown'
  const token = getBearerToken(req)
  const identity = token ? `token:${token.slice(-24)}` : `ip:${ip}`
  const key = `${policy.scope}:${identity}`
  const recent = (requestLog.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  requestLog.set(key, recent)

  for (const [entryKey, timestamps] of requestLog.entries()) {
    const active = timestamps.filter((time) => now - time < RATE_LIMIT_WINDOW_MS)
    if (active.length) requestLog.set(entryKey, active)
    else requestLog.delete(entryKey)
  }

  return recent.length > policy.limit
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

async function readBody(req, maxSize) {
  const raw = (await readRawBody(req, maxSize)).toString('utf8')
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

function configuredPortalRole(email) {
  const normalizedEmail = String(email || '').toLowerCase()
  const configuredAdmins = csv(process.env.ADMIN_EMAILS)
  const configuredStaff = csv(process.env.STAFF_EMAILS)

  if (configuredAdmins.includes(normalizedEmail)) return 'admin'
  if (configuredStaff.includes(normalizedEmail)) return 'staff'
  return ''
}

async function databaseRole(userId, client = pool) {
  if (!client || !userId) return ''
  const hasUserRole = await tableExists('tbl_userrole', client)
  const result = hasUserRole
    ? await client.query(
      `SELECT r.v_rolename AS v_rolename
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
    : await client.query(
      `SELECT r.v_rolename AS v_rolename
         FROM public.tbl_user u
         JOIN public.tbl_role r ON r.v_roleid = u.v_roleid
        WHERE u.v_userid = $1
          AND r.v_isactive = TRUE
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
  if (!client || !userId) return null
  const columns = await tableColumns('tbl_user', client)
  const result = await client.query(
    `SELECT v_userid AS v_userid,
            v_firstname AS v_firstname,
            v_lastname AS v_lastname,
            v_emailaddress AS v_emailaddress,
            ${optionalSelect(columns, ['v_contactnumber', 'v_mobilenumber'], 'v_contactnumber')},
            v_accountstatus,
            ${optionalSelect(columns, ['v_companyname'], 'v_companyname')},
            ${optionalSelect(columns, ['v_jobtitle'], 'v_jobtitle')},
            ${optionalSelect(columns, ['v_industry'], 'v_industry')},
            ${optionalSelect(columns, ['v_companyaddress'], 'v_companyaddress')}
       FROM public.tbl_user
      WHERE v_userid = $1
      LIMIT 1`,
    [userId],
  )
  return result.rows[0] || null
}

function signLocalToken(user) {
  const secret = process.env.APP_SESSION_SECRET || 'katala-local-development-secret'
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyLocalToken(token) {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const secret = process.env.APP_SESSION_SECRET || 'katala-local-development-secret'
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const provided = Buffer.from(signature)
  const calculated = Buffer.from(expected)
  if (provided.length !== calculated.length || !timingSafeEqual(provided, calculated)) return null
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!data?.sub || Number(data.exp || 0) <= Math.floor(Date.now() / 1000)) return null
  return data
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scrypt(String(password), salt, 64)).toString('hex')
  return `${salt}:${hash}`
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const attempted = (await scrypt(String(password), salt, 64)).toString('hex')
  const provided = Buffer.from(hash, 'hex')
  const calculated = Buffer.from(attempted, 'hex')
  return provided.length === calculated.length && timingSafeEqual(provided, calculated)
}

function localSessionResponse(user, token) {
  return {
    ok: true,
    session: {
      access_token: token,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          first_name: user.firstName,
          last_name: user.lastName,
          role: user.role,
          account_type: user.role,
          company_name: user.companyName,
          contact_number: user.contactNumber,
        },
      },
    },
    user: {
      userId: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      role: user.role,
      companyName: user.companyName || null,
      contactNumber: user.contactNumber || null,
      accountStatus: user.accountStatus,
    },
  }
}

async function localAuthUserByEmail(email, client = pool) {
  const userColumns = await tableColumns('tbl_user', client)
  const hasLocalAuthAccounts = await tableExists('local_auth_accounts', client)
  const hasUserRole = await tableExists('tbl_userrole', client)
  const result = hasLocalAuthAccounts
    ? await client.query(
      `SELECT la.v_userid AS v_userid,
              la.v_passwordhash AS v_passwordhash,
              u.v_firstname AS v_firstname,
              u.v_lastname AS v_lastname,
              u.v_emailaddress AS v_emailaddress,
              ${optionalSelect(userColumns, ['v_contactnumber', 'v_mobilenumber'], 'v_contactnumber')},
              u.v_accountstatus AS v_accountstatus,
              ${optionalSelect(userColumns, ['v_companyname'], 'v_companyname')},
              r.v_rolename AS role_name
         FROM local_auth_accounts la
         JOIN tbl_user u ON u.v_userid = la.v_userid
         ${hasUserRole ? 'LEFT JOIN tbl_userrole ur ON ur.v_userid = u.v_userid LEFT JOIN tbl_role r ON r.v_roleid = ur.v_roleid' : 'LEFT JOIN tbl_role r ON r.v_roleid = u.v_roleid'}
        WHERE LOWER(u.v_emailaddress) = LOWER($1)
        LIMIT 1`,
      [email],
    )
    : await client.query(
      `SELECT u.v_userid AS v_userid,
              u.v_passwordhash AS v_passwordhash,
              u.v_firstname AS v_firstname,
              u.v_lastname AS v_lastname,
              u.v_emailaddress AS v_emailaddress,
              ${optionalSelect(userColumns, ['v_contactnumber', 'v_mobilenumber'], 'v_contactnumber')},
              u.v_accountstatus AS v_accountstatus,
              ${optionalSelect(userColumns, ['v_companyname'], 'v_companyname')},
              r.v_rolename AS role_name
         FROM tbl_user u
         LEFT JOIN tbl_role r ON r.v_roleid = u.v_roleid
        WHERE LOWER(u.v_emailaddress) = LOWER($1)
           OR LOWER(u.v_username) = LOWER($1)
        LIMIT 1`,
      [email],
    )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.v_userid,
    email: row.v_emailaddress,
    firstName: row.v_firstname,
    lastName: row.v_lastname,
    contactNumber: row.v_contactnumber,
    companyName: row.v_companyname,
    accountStatus: normalizeAccountStatus(row.v_accountstatus),
    role: normalizePortalRole(row.role_name) || 'customer',
    passwordHash: row.v_passwordhash,
  }
}

async function localAuthUserById(userId, client = pool) {
  const userColumns = await tableColumns('tbl_user', client)
  const hasUserRole = await tableExists('tbl_userrole', client)
  const result = await client.query(
    `SELECT u.v_userid AS v_userid,
            u.v_firstname AS v_firstname,
            u.v_lastname AS v_lastname,
            u.v_emailaddress AS v_emailaddress,
            ${optionalSelect(userColumns, ['v_contactnumber', 'v_mobilenumber'], 'v_contactnumber')},
            u.v_accountstatus AS v_accountstatus,
            ${optionalSelect(userColumns, ['v_companyname'], 'v_companyname')},
            r.v_rolename AS role_name
       FROM tbl_user u
       ${hasUserRole ? 'LEFT JOIN tbl_userrole ur ON ur.v_userid = u.v_userid LEFT JOIN tbl_role r ON r.v_roleid = ur.v_roleid' : 'LEFT JOIN tbl_role r ON r.v_roleid = u.v_roleid'}
      WHERE u.v_userid = $1
      LIMIT 1`,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.v_userid,
    email: row.v_emailaddress,
    firstName: row.v_firstname,
    lastName: row.v_lastname,
    contactNumber: row.v_contactnumber,
    companyName: row.v_companyname,
    accountStatus: normalizeAccountStatus(row.v_accountstatus),
    role: normalizePortalRole(row.role_name) || 'customer',
  }
}

async function handleLocalSignup(req, res) {
  const body = await readBody(req)
  const email = clean(body.email, 180).toLowerCase()
  const password = String(body.password || '')
  const firstName = clean(body.firstName, 120)
  const lastName = clean(body.lastName, 120)
  const accountType = configuredPortalRole(email) || publicSignupRole(body.accountType)
  const status = accountType === 'staff' && !configuredPortalRole(email) ? 'Pending' : 'Active'

  if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'Complete the required signup fields.' })
  }
  if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' })

  const passwordHash = await hashPassword(password)
  const result = await transaction(async (client) => {
    const userColumns = await tableColumns('tbl_user', client)
    const hasLocalAuthAccounts = await tableExists('local_auth_accounts', client)
    const hasUserRole = await tableExists('tbl_userrole', client)
    const existing = await localAuthUserByEmail(email, client)
    if (existing) return { exists: true }
    const roleId = await ensureRole(client, accountType)
    const newUserId = randomUUID()
    const userValues = {
      ...(hasLocalAuthAccounts ? { v_userid: newUserId } : {}),
      ...(userColumns.has('v_roleid') && !hasUserRole ? { v_roleid: roleId } : {}),
      ...(userColumns.has('v_username') ? { v_username: email } : {}),
      ...(userColumns.has('v_passwordhash') ? { v_passwordhash: passwordHash } : {}),
      v_firstname: firstName,
      v_lastname: lastName,
      v_emailaddress: email,
      ...(userColumns.has('v_contactnumber') ? { v_contactnumber: nullable(body.contactNumber, 40) } : {}),
      ...(userColumns.has('v_mobilenumber') ? { v_mobilenumber: nullable(body.contactNumber, 40) } : {}),
      v_accountstatus: status,
      ...(userColumns.has('v_companyname') ? { v_companyname: nullable(body.companyName, 160) } : {}),
      ...(userColumns.has('v_jobtitle') ? { v_jobtitle: nullable(body.jobTitle, 120) } : {}),
      ...(userColumns.has('v_industry') ? { v_industry: nullable(body.industry, 120) } : {}),
      ...(userColumns.has('v_companyaddress') ? { v_companyaddress: nullable(body.companyAddress, 500) } : {}),
    }
    const insertUser = buildInsert('tbl_user', userValues)
    await client.query(insertUser.sql, insertUser.params)

    if (hasLocalAuthAccounts) {
      await client.query(
        'INSERT INTO local_auth_accounts (v_userid, v_emailaddress, v_passwordhash) VALUES ($1, $2, $3)',
        [newUserId, email, passwordHash],
      )
    }
    if (hasUserRole) await assignSingleRole(client, newUserId, accountType)
    const createdUser = await localAuthUserByEmail(email, client)
    if (!createdUser) throw new Error('USER_CREATE_FAILED')
    return createdUser
  })

  if (result.exists) return sendJson(res, 409, { error: 'An account already exists for this email.' })
  const token = signLocalToken(result)
  return sendJson(res, 201, {
    ...localSessionResponse(result, token),
    accountType,
    requiresApproval: accountType === 'staff',
    requiresEmailConfirmation: false,
  })
}

async function handleLocalSignin(req, res) {
  const body = await readBody(req)
  const email = clean(body.email, 180).toLowerCase()
  const password = String(body.password || '')
  const user = await localAuthUserByEmail(email)
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return sendJson(res, 401, { error: 'Invalid email or password.' })
  }
  const token = signLocalToken(user)
  return sendJson(res, 200, localSessionResponse(user, token))
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req)
  const localToken = verifyLocalToken(token)
  if (localToken?.sub) {
    const user = await localAuthUserById(localToken.sub).catch(() => null)
    if (user) {
      const configuredRole = configuredPortalRole(user.email)
      return {
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        accountStatus: configuredRole ? 'Active' : user.accountStatus,
        companyName: user.companyName || null,
        contactNumber: user.contactNumber || null,
        role: configuredRole || user.role,
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
    error: 'Database is not connected yet. Set DB_HOST, DB_NAME, and DB_USER for XAMPP/MySQL.',
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
  if (!await tableExists('tbl_userrole', client)) {
    await client.query('UPDATE public.tbl_user SET v_roleid = $2 WHERE v_userid = $1', [userId, roleId])
    return
  }
  await client.query('DELETE FROM public.tbl_userrole WHERE v_userid = $1', [userId])
  if (useMysql) {
    await client.query(
      `INSERT INTO tbl_userrole (v_userroleid, v_userid, v_roleid)
       VALUES ($1, $2, $3)`,
      [randomUUID(), userId, roleId],
    )
  } else {
    await client.query(
      `INSERT INTO public.tbl_userrole (v_userid, v_roleid)
       VALUES ($1, $2)`,
      [userId, roleId],
    )
  }
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
  const accountType = configuredPortalRole(email) || publicSignupRole(body.accountType)
  const status = accountType === 'staff' && !configuredPortalRole(email) ? 'Pending' : 'Active'

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
    assignedStaffName: row.assigned_staff_name || '',
    staffDesignation: row.staff_designation || '',
    department: row.department || '',
    createdAt: row.v_createdat,
  }
}

async function listAccounts(client = pool) {
  const userColumns = await tableColumns('tbl_user', client)
  const result = await client.query(
    `SELECT DISTINCT ON (u.v_userid)
            u.v_userid, u.v_firstname, u.v_lastname, u.v_emailaddress, u.v_contactnumber,
            u.v_accountstatus, u.v_companyname, u.v_createdat,
            ${optionalSelect(userColumns, ['v_assignedstaffname', 'v_assignedstaff', 'v_staffname'], 'assigned_staff_name')},
            ${optionalSelect(userColumns, ['v_staffdesignation', 'v_designation'], 'staff_designation')},
            ${optionalSelect(userColumns, ['v_department', 'v_team'], 'department')},
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

async function handleAdminDashboard(req, res) {
  const [accounts, materials, services, quotes, serviceRequests, payments] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM public.tbl_user`),
    pool.query(`SELECT COUNT(*)::int AS total FROM public.tbl_productvariant WHERE v_isactive = TRUE`),
    pool.query(`SELECT COUNT(*)::int AS total FROM public.tbl_service WHERE v_isactive = TRUE`),
    pool.query(`SELECT COUNT(*)::int AS total FROM public.tbl_quotation`),
    pool.query(`SELECT COUNT(*)::int AS total FROM public.tbl_servicerequest`),
    tableExists('tbl_paymenttransaction')
      ? pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(v_amount), 0) AS paid_total FROM public.tbl_paymenttransaction WHERE v_status = 'Paid'`)
      : Promise.resolve({ rows: [{ total: 0, paid_total: 0 }] }),
  ])

  const recentQuotes = await pool.query(
    `SELECT v_referencenumber, v_projectname, v_quotationstatus, v_submittedat
       FROM public.tbl_quotation
      ORDER BY v_updatedat DESC
      LIMIT 5`,
  )
  const recentServices = await pool.query(
    `SELECT sr.v_referencenumber, s.v_servicename, sr.v_requeststatus, sr.v_submittedat
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
      ORDER BY sr.v_updatedat DESC
      LIMIT 5`,
  )

  return sendJson(res, 200, {
    ok: true,
    metrics: {
      managedAccounts: Number(accounts.rows[0]?.total || 0),
      materialSkus: Number(materials.rows[0]?.total || 0),
      activeServices: Number(services.rows[0]?.total || 0),
      quotationRequests: Number(quotes.rows[0]?.total || 0),
      serviceRequests: Number(serviceRequests.rows[0]?.total || 0),
      paidPayments: Number(payments.rows[0]?.total || 0),
      paidRevenue: toMoneyNumber(payments.rows[0]?.paid_total || 0),
    },
    recentActivity: [
      ...recentQuotes.rows.map((row) => ({
        referenceNumber: row.v_referencenumber,
        title: row.v_projectname || 'Product quotation',
        type: 'Quotation',
        status: row.v_quotationstatus,
        submittedAt: row.v_submittedat,
      })),
      ...recentServices.rows.map((row) => ({
        referenceNumber: row.v_referencenumber,
        title: row.v_servicename || 'Service request',
        type: 'Service',
        status: row.v_requeststatus,
        submittedAt: row.v_submittedat,
      })),
    ].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).slice(0, 6),
  })
}

async function handleListStaffMembers(req, res) {
  const { accounts } = await listAccounts()
  const members = accounts
    .filter((account) => account.role === 'staff' && account.status === 'Active')
    .map((account) => ({
      id: account.id,
      name: account.assignedStaffName || account.name,
      accountName: account.name,
      email: account.email,
      designation: account.staffDesignation || '',
      department: account.department || '',
    }))
    .filter((member) => member.name)
    .sort((a, b) => a.name.localeCompare(b.name))
  return sendJson(res, 200, { ok: true, members })
}

async function handleUpdateAccount(req, res, userId) {
  if (!isUuid(userId)) return sendJson(res, 400, { error: 'Invalid account id.' })
  const body = await readBody(req)
  const nextRole = body.role === undefined ? '' : normalizePortalRole(body.role)
  const nextStatus = body.status === undefined ? '' : normalizeAccountStatus(body.status, '')
  const assignedStaffName = body.assignedStaffName === undefined ? undefined : nullable(body.assignedStaffName, 160)
  const staffDesignation = body.staffDesignation === undefined ? undefined : nullable(body.staffDesignation, 160)
  const department = body.department === undefined ? undefined : nullable(body.department, 160)
  const hasAssignmentPatch = assignedStaffName !== undefined || staffDesignation !== undefined || department !== undefined
  if (body.role !== undefined && !nextRole) return sendJson(res, 400, { error: 'Select a valid role.' })
  if (body.status !== undefined && !nextStatus) return sendJson(res, 400, { error: 'Select a valid account status.' })

  await transaction(async (client) => {
    const existing = await userAccountRecord(userId, client)
    if (!existing) {
      const error = new Error('USER_NOT_FOUND')
      error.statusCode = 404
      throw error
    }
    const effectiveRole = nextRole || await databaseRole(userId)
    if (hasAssignmentPatch && effectiveRole !== 'staff') {
      const error = new Error('ASSIGNMENT_REQUIRES_STAFF')
      error.statusCode = 400
      throw error
    }
    if (nextStatus) {
      await client.query(
        'UPDATE public.tbl_user SET v_accountstatus = $2, v_updatedat = now() WHERE v_userid = $1',
        [userId, nextStatus],
      )
    }
    if (nextRole) await assignSingleRole(client, userId, nextRole)
    if (hasAssignmentPatch) await updateStaffAssignment(client, userId, { assignedStaffName, staffDesignation, department })
  })

  return sendJson(res, 200, { ok: true, ...(await listAccounts()) })
}

async function updateStaffAssignment(client, userId, values) {
  const userColumns = await tableColumns('tbl_user', client)
  const mapping = [
    ['assignedStaffName', ['v_assignedstaffname', 'v_assignedstaff', 'v_staffname']],
    ['staffDesignation', ['v_staffdesignation', 'v_designation']],
    ['department', ['v_department', 'v_team']],
  ]
  const assignments = []
  const params = [userId]

  for (const [field, candidates] of mapping) {
    if (values[field] === undefined) continue
    const column = firstColumn(userColumns, candidates)
    if (!column) {
      const error = new Error('STAFF_ASSIGNMENT_SCHEMA_MISSING')
      error.statusCode = 409
      throw error
    }
    params.push(values[field])
    assignments.push(`${column} = $${params.length}`)
  }

  if (!assignments.length) return
  await client.query(
    `UPDATE public.tbl_user
        SET ${assignments.join(', ')}, v_updatedat = now()
      WHERE v_userid = $1`,
    params,
  )
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

async function existingTables(tableNames) {
  if (useMysql) {
    const found = new Set()
    for (const tableName of tableNames) {
      if (await tableExists(tableName)) found.add(tableName)
    }
    return found
  }

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
  if (useMysql) return await tableExists('tbl_paymenttransaction', client)
  const result = await client.query("SELECT to_regclass('public.tbl_paymenttransaction') AS table_name")
  return Boolean(result.rows[0]?.table_name)
}

function requirePaymentTableReady(res) {
  return paymentTableExists().then((ready) => {
    if (ready) return true
    sendJson(res, 503, {
      error: 'Payment transactions are not configured yet. Import the latest XAMPP MySQL schema, then try again.',
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
const tableCache = new Map()

async function tableExists(tableName, client = pool) {
  if (tableCache.has(tableName)) return tableCache.get(tableName)
  const result = await client.query(
     `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $2
          AND table_name = $1
     ) AS table_exists`,
    [tableName, useMysql ? mysqlConfig.database : 'public'],
  )
  const exists = Boolean(result.rows[0]?.table_exists ?? result.rows[0]?.exists)
  tableCache.set(tableName, exists)
  return exists
}

async function tableColumns(tableName, client = pool) {
  if (columnCache.has(tableName)) return columnCache.get(tableName)
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $2
        AND table_name = $1`,
    [tableName, useMysql ? mysqlConfig.database : 'public'],
  )
  const columns = new Set(result.rows.map((row) => String(row.column_name || '').toLowerCase()))
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

function tableIdColumn(table) {
  return {
    tbl_role: 'v_roleid',
    tbl_user: 'v_userid',
    tbl_userrole: 'v_userroleid',
    tbl_useraddress: 'v_useraddressid',
    tbl_productcategory: 'v_productcategoryid',
    tbl_product: 'v_productid',
    tbl_productvariant: 'v_productvariantid',
    tbl_servicecategory: 'v_servicecategoryid',
    tbl_service: 'v_serviceid',
    tbl_project: 'v_projectid',
    tbl_quotation: 'v_quotationid',
    tbl_quotationproductitem: 'v_quotationproductitemid',
    tbl_quotationserviceitem: 'v_quotationserviceitemid',
    tbl_quotationstatushistory: 'v_quotationstatushistoryid',
    tbl_paymenttransaction: 'v_paymenttransactionid',
    tbl_servicerequest: 'v_servicerequestid',
    tbl_servicerequeststatushistory: 'v_servicerequeststatushistoryid',
    tbl_appointment: 'v_appointmentid',
    tbl_serviceassignment: 'v_serviceassignmentid',
    tbl_attachment: 'v_attachmentid',
    tbl_notification: 'v_notificationid',
  }[table] || ''
}

function buildInsert(table, values) {
  const nextValues = { ...values }
  const idColumn = tableIdColumn(table)
  if (idColumn && nextValues[idColumn] === undefined) nextValues[idColumn] = randomUUID()
  const entries = Object.entries(nextValues).filter(([, value]) => value !== undefined)
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
  const hasProductVariants = await tableExists('tbl_productvariant', client)
  if (!hasProductVariants) return await listLegacyProducts(client, productColumns)

  const variantColumns = await tableColumns('tbl_productvariant', client)
  const categoryTableExists = await tableExists('tbl_productcategory', client)
  const categoryExpr = categoryTableExists
    ? 'pc.v_categoryname'
    : productColumns.has('v_productcategory')
      ? 'p.v_productcategory'
      : productColumns.has('v_category')
        ? 'p.v_category'
        : productColumns.has('v_producttype')
          ? 'p.v_producttype'
          : 'NULL'
  const stockExpr = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
  const reorderExpr = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])
  const productImageExpr = optionalSelect(productColumns, ['v_productimageurl', 'v_imageurl', 'v_image_url'], 'product_image_url')
  const variantImageExpr = optionalSelect(variantColumns, ['v_variantimageurl', 'v_productimageurl', 'v_imageurl', 'v_image_url'], 'variant_image_url')
  const minPriceColumn = firstColumn(variantColumns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
  const maxPriceColumn = firstColumn(variantColumns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])

  const result = await client.query(
    `SELECT p.v_productid,
            p.v_productname,
            ${categoryExpr} AS category,
            ${productImageExpr},
            pv.v_productvariantid,
            pv.v_productcode,
            pv.v_productmodel,
            pv.v_productsize,
            pv.v_productunit,
            ${optionalSelect(variantColumns, ['v_variantdescription', 'v_description'], 'variant_description')},
            ${variantImageExpr},
            pv.v_isactive AS is_active,
            ${stockExpr ? `pv.${stockExpr}` : 'NULL'} AS stock_quantity,
            ${reorderExpr ? `pv.${reorderExpr}` : 'NULL'} AS reorder_level,
            ${minPriceColumn ? `pv.${minPriceColumn}` : 'NULL'} AS min_price,
            ${maxPriceColumn ? `pv.${maxPriceColumn}` : 'NULL'} AS max_price
       FROM public.tbl_productvariant pv
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
       ${categoryTableExists ? 'LEFT JOIN public.tbl_productcategory pc ON pc.v_productcategoryid = p.v_productcategoryid' : ''}
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
    description: row.variant_description || '',
    imageUrl: row.variant_image_url || row.product_image_url || '',
    stock: row.stock_quantity === null || row.stock_quantity === undefined ? null : Number(row.stock_quantity),
    reorderLevel: row.reorder_level === null || row.reorder_level === undefined ? null : Number(row.reorder_level),
    minPrice: row.min_price === null || row.min_price === undefined ? null : Number(row.min_price),
    maxPrice: row.max_price === null || row.max_price === undefined ? null : Number(row.max_price),
    active: Boolean(row.is_active),
    status: materialStatus(row),
  }))
}

async function listLegacyProducts(client = pool, productColumns = null) {
  const columns = productColumns || await tableColumns('tbl_product', client)
  const hasInventory = await tableExists('tbl_inventory', client)
  const inventoryColumns = hasInventory ? await tableColumns('tbl_inventory', client) : new Set()
  const stockColumn = firstColumn(inventoryColumns, ['v_quantityavailable', 'v_quantityonhand'])
  const reorderColumn = firstColumn(inventoryColumns, ['v_reorderlevel'])
  const priceColumn = firstColumn(columns, ['v_currentprice', 'v_price'])

  const result = await client.query(
    `SELECT p.v_productId,
            p.v_productCode,
            p.v_productName,
            ${optionalSelect(columns, ['v_productcategory', 'v_category'], 'category')},
            ${optionalSelect(columns, ['v_model', 'v_productmodel'], 'model')},
            ${optionalSelect(columns, ['v_unitofmeasure', 'v_productunit'], 'unit')},
            ${optionalSelect(columns, ['v_productdescription', 'v_description'], 'description')},
            ${optionalSelect(columns, ['v_productimageurl', 'v_imageurl', 'v_image_url'], 'image_url')},
            p.v_isActive AS is_active,
            ${priceColumn ? `p.${priceColumn}` : 'NULL'} AS current_price,
            ${hasInventory && stockColumn ? `i.${stockColumn}` : 'NULL'} AS stock_quantity,
            ${hasInventory && reorderColumn ? `i.${reorderColumn}` : 'NULL'} AS reorder_level
       FROM public.tbl_product p
       ${hasInventory ? 'LEFT JOIN public.tbl_inventory i ON i.v_productId = p.v_productId' : ''}
      ORDER BY p.v_productName, p.v_model`,
  )

  return result.rows.map((row) => ({
    productId: String(row.v_productid || row.v_productId || ''),
    variantId: String(row.v_productid || row.v_productId || ''),
    sku: row.v_productcode || row.v_productCode || '',
    name: row.v_productname || row.v_productName || '',
    category: row.category || 'Uncategorized',
    model: row.model || '',
    size: '',
    unit: row.unit || '',
    description: row.description || '',
    imageUrl: row.image_url || '',
    stock: row.stock_quantity === null || row.stock_quantity === undefined ? null : Number(row.stock_quantity),
    reorderLevel: row.reorder_level === null || row.reorder_level === undefined ? null : Number(row.reorder_level),
    minPrice: row.current_price === null || row.current_price === undefined ? null : Number(row.current_price),
    maxPrice: row.current_price === null || row.current_price === undefined ? null : Number(row.current_price),
    active: Boolean(row.is_active),
    status: materialStatus(row),
    legacyCatalog: true,
  }))
}

async function listServices(client = pool) {
  const serviceColumns = await tableColumns('tbl_service', client)
  const categoryTableExists = await tableExists('tbl_servicecategory', client)
  const categoryColumn = firstColumn(serviceColumns, ['v_servicecategory', 'v_category'])
  const durationColumn = firstColumn(serviceColumns, ['v_estimatedduration', 'v_duration'])
  const descriptionColumn = firstColumn(serviceColumns, ['v_servicedescription', 'v_description'])
  const imageColumn = firstColumn(serviceColumns, ['v_serviceimageurl', 'v_imageurl', 'v_image_url'])
  const minPriceColumn = firstColumn(serviceColumns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
  const maxPriceColumn = firstColumn(serviceColumns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])
  const result = await client.query(
    `SELECT s.v_serviceid,
            s.v_servicecode,
            s.v_servicename,
            s.v_isactive,
            ${categoryTableExists ? 'sc.v_categoryname AS category' : categoryColumn ? `s.${categoryColumn} AS category` : 'NULL AS category'},
            ${durationColumn ? `s.${durationColumn}` : 'NULL'} AS duration,
            ${descriptionColumn ? `s.${descriptionColumn}` : 'NULL'} AS description,
            ${imageColumn ? `s.${imageColumn}` : 'NULL'} AS image_url,
            ${minPriceColumn ? `s.${minPriceColumn}` : 'NULL'} AS min_price,
            ${maxPriceColumn ? `s.${maxPriceColumn}` : 'NULL'} AS max_price
       FROM public.tbl_service s
       ${categoryTableExists ? 'LEFT JOIN public.tbl_servicecategory sc ON sc.v_servicecategoryid = s.v_servicecategoryid' : ''}
      ORDER BY s.v_servicename`,
  )

  return result.rows.map((row) => ({
    serviceId: row.v_serviceid,
    code: row.v_servicecode || '',
    name: row.v_servicename || '',
    category: row.category || 'Service',
    duration: row.duration || '',
    description: row.description || '',
    imageUrl: row.image_url || '',
    minPrice: row.min_price === null || row.min_price === undefined ? null : Number(row.min_price),
    maxPrice: row.max_price === null || row.max_price === undefined ? null : Number(row.max_price),
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

function validateQuotationFields(fields) {
  if (!fields.projectName && !fields.establishmentName) return 'Project name or establishment is required.'
  if (!fields.projectAddress) return 'Project address is required.'
  if (!fields.projectDescription || fields.projectDescription.length < 5) return 'Project description must be at least 5 characters.'
  return ''
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
  const contactPerson = clean(body.contactPerson, 160)
  if (!contactPerson) return { error: 'Contact person is required.' }
  const contactNumber = clean(body.contactNumber, 60)
  if (!/^[+()\d\s.-]{7,30}$/.test(contactNumber)) return { error: 'Enter a valid contact number.' }
  const projectAddress = clean(body.projectAddress, 1000)
  if (!projectAddress) return { error: 'Service address is required.' }

  const preferredDate = nullable(body.preferredDate, 20)
  const preferredTimeRaw = nullable(body.preferredTime, 20)
  const scheduleError = validatePreferredSchedule(preferredDate, preferredTimeRaw)
  if (scheduleError) return { error: scheduleError }
  const preferredTime = normalizePreferredTime(preferredTimeRaw)

  const userAddressId = nullable(body.userAddressId, 80)
  if (userAddressId && !isUuid(userAddressId)) return { error: 'Invalid saved address.' }
  if (body.recurrenceFrequency !== undefined && !isSupportedRecurrenceFrequency(body.recurrenceFrequency)) {
    return { error: 'Invalid recurrence frequency.' }
  }
  const recurrenceFrequency = normalizeRecurrenceFrequency(body.recurrenceFrequency)
  const customerRemarks = nullable(body.customerRemarks, 2000)

  return {
    values: {
      userAddressId,
      projectName: nullable(body.projectName, 160),
      establishmentName: nullable(body.establishmentName, 160),
      contactPerson,
      contactNumber,
      problemDescription,
      projectAddress,
      preferredDate,
      preferredTime,
      recurrenceFrequency,
      priorityLevel: priority,
      customerRemarks: customerRemarksWithRecurrence(customerRemarks, recurrenceFrequency),
    },
  }
}

function normalizeRecurrenceFrequency(value) {
  const normalized = String(value || 'One-time').trim().toLowerCase()
  if (normalized === 'weekly') return 'Weekly'
  if (normalized === 'monthly') return 'Monthly'
  if (normalized === 'quarterly') return 'Quarterly'
  if (normalized === 'half-year' || normalized === 'half year' || normalized === 'semiannual' || normalized === 'semi-annual') return 'Half-year'
  if (normalized === 'yearly' || normalized === 'annual' || normalized === 'annually') return 'Yearly'
  return 'One-time'
}

function isSupportedRecurrenceFrequency(value) {
  const normalized = String(value || 'One-time').trim().toLowerCase()
  return ['one-time', 'one time', 'weekly', 'monthly', 'quarterly', 'half-year', 'half year', 'semiannual', 'semi-annual', 'yearly', 'annual', 'annually'].includes(normalized)
}

function customerRemarksWithRecurrence(remarks, recurrenceFrequency) {
  const cleanRemarks = stripRecurrenceFromRemarks(remarks)
  const line = `Recurrence: ${recurrenceFrequency}`
  return [line, cleanRemarks].filter(Boolean).join('\n')
}

function recurrenceFromRemarks(remarks) {
  const match = String(remarks || '').match(/^Recurrence:\s*(.+)$/im)
  return normalizeRecurrenceFrequency(match?.[1])
}

function stripRecurrenceFromRemarks(remarks) {
  return String(remarks || '')
    .replace(/^Recurrence:\s*.+$/im, '')
    .trim() || null
}

function validateQuotationItems(body) {
  const source = Array.isArray(body.items) ? body.items : []
  if (source.length < 1 || source.length > 30) return { error: 'A quotation must contain between 1 and 30 product items.' }

  const items = []
  for (const raw of source) {
    const productVariantId = clean(raw?.productVariantId, 80)
    const productName = clean(raw?.productName, 180)
    const productModel = nullable(raw?.productModel, 180)
    const productSize = nullable(raw?.productSize, 120)
    const itemDescription = nullable(raw?.itemDescription, 1000)
    const quantity = Number(raw?.quantity)

    if (!productName) return { error: 'A product name is missing.' }
    if (productVariantId && !isUuid(productVariantId)) return { error: 'A selected material id is invalid.' }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: 'Product quantity must be between 1 and 999.' }
    items.push({ productVariantId, productName, productModel, productSize, itemDescription, quantity })
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
  if (item.productVariantId) {
    const byId = await client.query(
      `SELECT pv.v_productvariantid, pv.v_productcode, pv.v_productmodel, pv.v_productsize
         FROM public.tbl_productvariant pv
         JOIN public.tbl_product p ON p.v_productid = pv.v_productid
        WHERE pv.v_productvariantid = $1
          AND p.v_isactive = TRUE
          AND pv.v_isactive = TRUE
        LIMIT 1`,
      [item.productVariantId],
    )
    if (byId.rowCount) return byId.rows[0]
  }

  const baseParams = [item.productName]
  const baseConditions = [
    'LOWER(p.v_productname) = LOWER($1)',
    'p.v_isactive = TRUE',
    'pv.v_isactive = TRUE',
  ]

  if (item.productModel) {
    baseParams.push(item.productModel)
    baseConditions.push(`LOWER(COALESCE(pv.v_productmodel, '')) = LOWER($${baseParams.length})`)
  }
  if (item.productSize) {
    baseParams.push(item.productSize)
    baseConditions.push(`LOWER(COALESCE(pv.v_productsize, '')) = LOWER($${baseParams.length})`)
  }

  let result = await client.query(
    `SELECT pv.v_productvariantid, pv.v_productcode, pv.v_productmodel, pv.v_productsize
       FROM public.tbl_productvariant pv
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE ${baseConditions.join(' AND ')}
      LIMIT 2`,
    baseParams,
  )

  if (!result.rowCount && item.productModel) {
    const fallbackConditions = [
      'LOWER(p.v_productname) = LOWER($1)',
      'p.v_isactive = TRUE',
      'pv.v_isactive = TRUE',
      'LOWER(COALESCE(pv.v_productcode, \'\')) = LOWER($2)',
    ]
    const fallbackParams = [item.productName, item.productModel]
    if (item.productSize) {
      fallbackParams.push(item.productSize)
      fallbackConditions.push(`LOWER(COALESCE(pv.v_productsize, '')) = LOWER($${fallbackParams.length})`)
    }
    result = await client.query(
      `SELECT pv.v_productvariantid, pv.v_productcode, pv.v_productmodel, pv.v_productsize
         FROM public.tbl_productvariant pv
         JOIN public.tbl_product p ON p.v_productid = pv.v_productid
        WHERE ${fallbackConditions.join(' AND ')}
        LIMIT 2`,
      fallbackParams,
    )
  }

  if (!result.rowCount && item.productModel && item.productSize) {
    result = await client.query(
      `SELECT pv.v_productvariantid, pv.v_productcode, pv.v_productmodel, pv.v_productsize
         FROM public.tbl_productvariant pv
         JOIN public.tbl_product p ON p.v_productid = pv.v_productid
        WHERE LOWER(p.v_productname) = LOWER($1)
          AND LOWER(COALESCE(pv.v_productsize, '')) = LOWER($2)
          AND p.v_isactive = TRUE
          AND pv.v_isactive = TRUE
        LIMIT 2`,
      [item.productName, item.productSize],
    )
  }

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

function dateOnly(value) {
  if (!value) return ''
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value)
    const date = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${date.year}-${date.month}-${date.day}`
  }
  const text = String(value)
  return text.includes('T') ? text.slice(0, 10) : text
}

function timeOnly(value) {
  if (!value) return ''
  const text = String(value)
  return text.slice(0, 5)
}

function toCentavos(value) {
  return Math.round(toMoneyNumber(value) * 100)
}

function quotationUnitPrice(value) {
  if (value !== null && value !== undefined) return toMoneyNumber(value)
  return null
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

  return {
    referenceNumber: row.v_referencenumber,
    projectName: row.v_projectname,
    establishmentName: row.v_establishmentname,
    projectDescription: row.v_projectdescription,
    projectAddress: row.v_projectaddress,
    customerRemarks: row.v_customerremarks,
    status: row.v_quotationstatus,
    quotationDate: dateOnly(row.v_quotationdate),
    validUntil: dateOnly(row.v_validuntil),
    preferredDate: dateOnly(row.v_scheduleddate),
    preferredTime: timeOnly(row.v_scheduledtime),
    staff: row.v_assignedstaff,
    submittedAt: row.v_submittedat,
    updatedAt: row.v_updatedat,
    completedAt: row.v_completedat,
    additionalCost: totals.additionalCost,
    subtotal: totals.subtotal,
    totalAmount: totals.totalAmount,
    canPay: isPayableQuotationStatus(quotationStatus)
      && totals.totalAmount > 0,
    paymongoConfigured: Boolean(paymongoSecretKey),
    xenditConfigured: Boolean(xenditSecretKey),
    payment: paymentStatusDto(payment),
    items,
  }
}

async function handleCreateQuotation(req, res, userId) {
  const body = await readBody(req)
  const itemResult = validateQuotationItems(body)
  if (itemResult.error) return sendJson(res, 400, { error: itemResult.error })
  const fields = quotationFields(body)
  const fieldError = validateQuotationFields(fields)
  if (fieldError) return sendJson(res, 400, { error: fieldError })
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
        (v_quotationid, v_userid, v_referencenumber, v_projectname, v_establishmentname, v_projectdescription, v_projectaddress, v_customerremarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        randomUUID(),
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
          (v_quotationproductitemid, v_quotationid, v_productvariantid, v_quantity, v_itemdescription, v_unitprice)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), quotationId, item.variant.v_productvariantid, item.quantity, item.itemDescription, null],
      )
    }

    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationstatushistoryid, v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, 'Submitted', 'Submitted by customer for staff review')`,
      [randomUUID(), quotationId, userId],
    )

    return quotation.rows[0]
  })

  return sendJson(res, 201, {
    ok: true,
    referenceNumber: result.v_referencenumber,
    status: result.v_quotationstatus,
    message: 'Quotation request submitted for staff review. Final charges will be set by Katala staff.',
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
    `SELECT qpi.v_quotationproductitemid, qpi.v_quantity, qpi.v_unitprice, qpi.v_itemdescription,
            pv.v_productvariantid,
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
      quotationProductItemId: item.v_quotationproductitemid,
      productVariantId: item.v_productvariantid,
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
  const fieldError = validateQuotationFields(fields)
  if (fieldError) return sendJson(res, 400, { error: fieldError })

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
    if (!['Submitted', 'Under Review'].includes(row.v_quotationstatus)) {
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

function publicAppBase(req, options = {}) {
  if (options.preferConfiguredHttps && /^https:\/\//i.test(appOrigin)) return appOrigin

  const origin = req.headers.origin && /^https?:\/\//i.test(req.headers.origin)
    ? req.headers.origin
    : appOrigin
  return (origin || `http://${req.headers.host || `localhost:${port}`}`).replace(/\/$/, '')
}

function paymongoAuthHeader() {
  return `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString('base64')}`
}

function xenditAuthHeader() {
  return `Basic ${Buffer.from(`${xenditSecretKey}:`).toString('base64')}`
}

function paymongoApiError(data, fallback) {
  const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.message || data?.error
  return clean(detail || fallback, 1000)
}

function xenditApiError(data, fallback) {
  const detail = data?.message || data?.error_message || data?.errors?.[0]?.message || data?.error_code
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

async function xenditRequest(path, options = {}) {
  if (!xenditSecretKey) {
    const error = new Error('XENDIT_NOT_CONFIGURED')
    error.statusCode = 503
    throw error
  }

  const response = await fetch(`https://api.xendit.co${path}`, {
    ...options,
    headers: {
      'Authorization': xenditAuthHeader(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error('XENDIT_API_ERROR')
    error.statusCode = response.status >= 500 ? 502 : 400
    error.publicMessage = xenditApiError(data, 'Xendit rejected the payment request.')
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

function xenditReference(value, fallback = 'KATALA') {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 64)
  return normalized || fallback
}

function xenditName(value, fallback) {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
  return normalized || fallback
}

function xenditPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return undefined
  if (digits.startsWith('63')) return `+${digits}`
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`
  return `+63${digits}`
}

function xenditCheckoutItems(quotation) {
  const items = quotation.items
    .map((item, index) => ({
      reference_id: xenditReference(item.productCode || `${quotation.referenceNumber}${index}`, `ITEM${index + 1}`),
      name: clean([item.productName, item.productSize || item.productModel].filter(Boolean).join(' - '), 255) || 'Katala quotation item',
      description: clean(item.itemDescription || item.productCode || 'Katala quotation item', 255),
      type: 'PHYSICAL_PRODUCT',
      category: 'Construction Materials',
      net_unit_amount: toMoneyNumber(item.unitPrice),
      quantity: Math.max(1, Number(item.quantity || 1)),
      currency: 'PHP',
    }))
    .filter((item) => item.net_unit_amount > 0)

  if (quotation.additionalCost > 0) {
    items.push({
      reference_id: xenditReference(`${quotation.referenceNumber}FEE`, 'FEE'),
      name: 'Additional project cost',
      description: 'Reviewed quotation adjustment',
      type: 'FEE',
      category: 'Service Fee',
      net_unit_amount: toMoneyNumber(quotation.additionalCost),
      quantity: 1,
      currency: 'PHP',
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

async function handleCreateXenditCheckout(req, res, userId, referenceNumber) {
  if (!(await requirePaymentTableReady(res))) return
  if (!xenditSecretKey) return sendJson(res, 503, { error: 'Xendit is not configured yet. Set XENDIT_SECRET_KEY in .env.' })

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
    await client.query(
      `INSERT INTO public.tbl_paymenttransaction
        (v_quotationid, v_userid, v_referencenumber, v_status, v_amount, v_currency, v_paymentmethod)
       SELECT v_quotationid, v_userid, $3, 'Pending', $4, 'PHP', 'Xendit Payment Link'
         FROM public.tbl_quotation
        WHERE v_userid = $1
          AND v_referencenumber = $2`,
      [userId, referenceNumber, paymentReference, quotation.totalAmount],
    )
    const insertedRecord = (await client.query(
      `SELECT * FROM public.tbl_paymenttransaction WHERE v_referencenumber = $1 LIMIT 1`,
      [paymentReference],
    )).rows[0]

    const base = publicAppBase(req, { preferConfiguredHttps: true })
    const hasHttpsReturn = /^https:\/\//i.test(base)
    const user = await client.query(
      `SELECT v_firstname, v_lastname, v_emailaddress, v_contactnumber
         FROM public.tbl_user
        WHERE v_userid = $1
        LIMIT 1`,
      [userId],
    )
    const customer = user.rows[0] || {}
    const firstName = xenditName(customer.v_firstname, 'Katala')
    const lastName = xenditName(customer.v_lastname, 'Customer')

    const xendit = await xenditRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: paymentReference,
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        amount: toMoneyNumber(quotation.totalAmount),
        currency: 'PHP',
        country: 'PH',
        customer: {
          reference_id: xenditReference(`${userId}-${quotation.referenceNumber}`, 'CUSTOMER'),
          type: 'INDIVIDUAL',
          email: customer.v_emailaddress || undefined,
          mobile_number: xenditPhone(customer.v_contactnumber),
          individual_detail: {
            given_names: firstName,
            surname: lastName,
          },
        },
        items: xenditCheckoutItems(quotation),
        capture_method: 'AUTOMATIC',
        locale: 'en',
        allowed_payment_channels: xenditPaymentChannels.length ? xenditPaymentChannels : undefined,
        description: `Katala quotation ${referenceNumber}`,
        success_return_url: hasHttpsReturn ? `${base}/?payment_reference=${encodeURIComponent(paymentReference)}#products` : undefined,
        cancel_return_url: hasHttpsReturn ? `${base}/?payment_cancelled=${encodeURIComponent(paymentReference)}#products` : undefined,
        metadata: {
          quotation_reference: referenceNumber,
          payment_reference: paymentReference,
          user_id: userId,
          provider: 'xendit',
        },
      }),
    })

    const updated = await client.query(
      `UPDATE public.tbl_paymenttransaction
          SET v_paymongo_checkoutsessionid = $2,
              v_paymongo_paymentintentid = $3,
              v_paymongo_paymentid = $4,
              v_checkouturl = $5,
              v_rawpayload = $6,
              v_updatedat = NOW()
        WHERE v_paymenttransactionid = $1
       RETURNING *`,
      [
        insertedRecord.v_paymenttransactionid,
        xendit.payment_session_id || null,
        xendit.payment_request_id || null,
        xendit.payment_id || null,
        xendit.payment_link_url || null,
        xendit,
      ],
    )

    return { payment: updated.rows[0], checkoutUrl: xendit.payment_link_url }
  })

  if (result.notFound) return sendJson(res, 404, { error: 'Quotation not found.' })
  if (result.notPayable) {
    return sendJson(res, 409, {
      error: 'This quotation is not ready for payment yet. It needs a positive item price before Xendit checkout can start.',
      quotation: result.notPayable,
    })
  }
  if (result.alreadyPaid) return sendJson(res, 409, { error: 'This quotation has already been paid.', payment: paymentStatusDto(result.alreadyPaid) })
  if (!result.checkoutUrl && !result.existing?.v_checkouturl) return sendJson(res, 502, { error: 'Xendit did not return a checkout URL.' })

  const payment = result.payment || result.existing
  return sendJson(res, 201, {
    ok: true,
    checkoutUrl: result.checkoutUrl || result.existing.v_checkouturl,
    payment: paymentStatusDto(payment),
  })
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

async function resolveCategoryId(client, table, idColumn, nameColumn, value, fallback) {
  if (!(await tableExists(table, client))) return null
  const categoryName = clean(value || fallback, 120) || fallback
  const existing = await client.query(
    `SELECT ${idColumn}
       FROM public.${table}
      WHERE LOWER(${nameColumn}) = LOWER($1)
      LIMIT 1`,
    [categoryName],
  )
  if (existing.rowCount) return existing.rows[0][idColumn]

  const insert = buildInsert(table, {
    [nameColumn]: categoryName,
    v_categorydescription: null,
    v_isactive: true,
  })
  const created = await client.query(insert.sql, insert.params)
  return created.rows[0][idColumn]
}

function imageInput(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  return text.slice(0, 900_000)
}

async function handleConfirmQuotation(req, res, userId, referenceNumber) {
  const result = await transaction(async (client) => {
    const updated = await client.query(
      `UPDATE public.tbl_quotation
          SET v_quotationstatus = 'Customer Confirmed',
              v_updatedat = NOW()
        WHERE v_userid = $1
          AND v_referencenumber = $2
          AND LOWER(v_quotationstatus) IN ('accepted', 'approved', 'ready for payment', 'for payment', 'customer confirmed')
        RETURNING *`,
      [userId, referenceNumber],
    )
    if (!updated.rowCount) return null
    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, 'Customer Confirmed', 'Confirmed by customer')`,
      [updated.rows[0].v_quotationid, userId],
    )
    return updated.rows[0]
  })

  if (!result) return sendJson(res, 409, { error: 'Quotation is not ready for customer confirmation.' })
  const quotation = await loadQuotation(userId, referenceNumber)
  return sendJson(res, 200, { ok: true, quotation })
}

async function handleMockQuotationPayment(req, res, userId, referenceNumber) {
  if (!(await requirePaymentTableReady(res))) return
  const result = await transaction(async (client) => {
    await ensureUserExists(client, userId)
    const quotation = await loadPayableQuotation(client, userId, referenceNumber)
    if (!quotation) return { notFound: true }
    if (!quotation.canPay) return { notPayable: quotation }

    const existing = await client.query(
      `SELECT *
         FROM public.tbl_paymenttransaction
        WHERE v_userid = $1
          AND v_quotationid = (
            SELECT v_quotationid FROM public.tbl_quotation WHERE v_userid = $1 AND v_referencenumber = $2 LIMIT 1
          )
        ORDER BY v_createdat DESC
        LIMIT 1`,
      [userId, referenceNumber],
    )
    if (existing.rowCount && existing.rows[0].v_status === 'Paid') return { alreadyPaid: existing.rows[0] }

    const paymentReference = existing.rows[0]?.v_referencenumber || transactionReference(referenceNumber)
    const receipt = existing.rows[0]?.v_receiptnumber || receiptNumber()
    const payment = existing.rowCount
      ? await client.query(
          `UPDATE public.tbl_paymenttransaction
              SET v_status = 'Paid',
                  v_amount = $2,
                  v_paymentmethod = 'Mock payment',
                  v_receiptnumber = COALESCE(v_receiptnumber, $3),
                  v_paidat = COALESCE(v_paidat, NOW()),
                  v_updatedat = NOW()
            WHERE v_paymenttransactionid = $1
            RETURNING *`,
          [existing.rows[0].v_paymenttransactionid, quotation.totalAmount, receipt],
        )
      : await client.query(
          `INSERT INTO public.tbl_paymenttransaction
            (v_quotationid, v_userid, v_referencenumber, v_status, v_amount, v_currency, v_paymentmethod, v_receiptnumber, v_paidat)
           SELECT v_quotationid, v_userid, $3, 'Paid', $4, 'PHP', 'Mock payment', $5, NOW()
             FROM public.tbl_quotation
            WHERE v_userid = $1
              AND v_referencenumber = $2
           RETURNING *`,
          [userId, referenceNumber, paymentReference, quotation.totalAmount, receipt],
        )

    await client.query(
      `UPDATE public.tbl_quotation
          SET v_quotationstatus = 'Paid',
              v_updatedat = NOW()
        WHERE v_userid = $1
          AND v_referencenumber = $2`,
      [userId, referenceNumber],
    )
    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       SELECT v_quotationid, $1, 'Paid', 'Mock payment confirmed by customer'
         FROM public.tbl_quotation
        WHERE v_userid = $1
          AND v_referencenumber = $2`,
      [userId, referenceNumber],
    )

    if (payment.rows[0]) return { payment: payment.rows[0] }
    const savedPayment = await client.query(
      `SELECT *
         FROM public.tbl_paymenttransaction
        WHERE v_referencenumber = $1
        LIMIT 1`,
      [paymentReference],
    )
    return { payment: savedPayment.rows[0] || null }
  })

  if (result.notFound) return sendJson(res, 404, { error: 'Quotation not found.' })
  if (result.notPayable) return sendJson(res, 409, { error: 'This quotation is not ready for payment yet.', quotation: result.notPayable })
  const payment = result.payment || result.alreadyPaid
  if (!payment) return sendJson(res, 500, { error: 'Payment was saved but could not be reloaded.' })
  const quotation = await loadQuotation(userId, referenceNumber)
  const receipt = await loadReceipt(userId, payment.v_referencenumber)
  return sendJson(res, 200, { ok: true, quotation, payment: paymentStatusDto(payment), receipt })
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

function verifyXenditWebhookToken(tokenHeader) {
  if (!xenditWebhookToken) return process.env.NODE_ENV !== 'production'
  if (!tokenHeader) return false
  const expectedBuffer = Buffer.from(xenditWebhookToken)
  const receivedBuffer = Buffer.from(String(tokenHeader).trim())
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function xenditSessionFromPayload(payload) {
  if (payload?.data?.payment_session_id) return payload.data
  if (payload?.payment_session_id) return payload
  return null
}

function xenditPaymentStatus(session) {
  const status = String(session?.status || '').toUpperCase()
  if (status === 'COMPLETED' || status === 'SUCCEEDED') return 'Paid'
  if (status === 'EXPIRED') return 'Expired'
  if (status === 'CANCELED' || status === 'CANCELLED') return 'Cancelled'
  if (status === 'FAILED') return 'Failed'
  return 'Pending'
}

async function updatePaymentFromXenditSession(session, rawPayload = null) {
  if (!session) return null
  if (!(await paymentTableExists())) return null

  const paymentReference = session.reference_id || session.metadata?.payment_reference || null
  const sessionId = session.payment_session_id || null
  if (!paymentReference && !sessionId) return null

  const status = xenditPaymentStatus(session)
  const result = await pool.query(
    `UPDATE public.tbl_paymenttransaction
        SET v_status = $3,
            v_paymongo_checkoutsessionid = COALESCE(v_paymongo_checkoutsessionid, $4),
            v_paymongo_paymentintentid = COALESCE($5, v_paymongo_paymentintentid),
            v_paymongo_paymentid = COALESCE($6, v_paymongo_paymentid),
            v_paymentmethod = COALESCE(v_paymentmethod, 'Xendit Payment Link'),
            v_checkouturl = COALESCE(v_checkouturl, $7),
            v_receiptnumber = CASE WHEN $3 = 'Paid' THEN COALESCE(v_receiptnumber, $8) ELSE v_receiptnumber END,
            v_paidat = CASE WHEN $3 = 'Paid' THEN COALESCE(v_paidat, NOW()) ELSE v_paidat END,
            v_rawpayload = COALESCE($9, v_rawpayload),
            v_amount = CASE WHEN $10::numeric IS NOT NULL AND $3 = 'Paid' THEN $10 ELSE v_amount END,
            v_updatedat = NOW()
      WHERE ($1::text IS NOT NULL AND v_referencenumber = $1)
         OR ($2::text IS NOT NULL AND v_paymongo_checkoutsessionid = $2)
      RETURNING *`,
    [
      paymentReference,
      sessionId,
      status,
      sessionId,
      session.payment_request_id || null,
      session.payment_id || null,
      session.payment_link_url || null,
      receiptNumber(),
      rawPayload,
      session.amount ? toMoneyNumber(session.amount) : null,
    ],
  )
  return result.rows[0] || null
}

async function refreshPaymentFromXendit(payment) {
  if (!payment?.v_paymongo_checkoutsessionid || !xenditSecretKey) return payment
  if (!String(payment.v_paymongo_checkoutsessionid).startsWith('ps-')) return payment
  const session = await xenditRequest(`/sessions/${encodeURIComponent(payment.v_paymongo_checkoutsessionid)}`, {
    method: 'GET',
  })
  return await updatePaymentFromXenditSession(session, session) || payment
}

async function refreshPaymentFromGateway(payment) {
  if (String(payment?.v_paymongo_checkoutsessionid || '').startsWith('ps-')) return await refreshPaymentFromXendit(payment)
  return await refreshPaymentFromPaymongo(payment)
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
    await refreshPaymentFromGateway(payment.rows[0])
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

async function handleXenditWebhook(req, res) {
  if (!pool) return sendJson(res, 503, { error: 'Database is not connected.' })

  const rawBody = await readRawBody(req, 256_000)
  const token = req.headers['x-callback-token']
  if (!verifyXenditWebhookToken(token)) return sendJson(res, 401, { error: 'Invalid Xendit webhook token.' })

  const payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
  const eventType = String(payload?.event || '').toLowerCase()
  if (eventType.startsWith('payment_session.')) {
    await updatePaymentFromXenditSession(xenditSessionFromPayload(payload), payload)
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
        (v_servicerequestid, v_userid, v_serviceid, v_useraddressid, v_referencenumber, v_projectname, v_establishmentname,
         v_contactperson, v_contactnumber, v_problemdescription, v_projectaddress, v_preferreddate,
         v_preferredtime, v_prioritylevel, v_customerremarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        randomUUID(),
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
        (v_servicerequeststatushistoryid, v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, 'Submitted', 'Submitted by customer')`,
      [randomUUID(), inserted.rows[0].v_servicerequestid, userId],
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
  const quotedAmount = row.v_quotedamount === null || row.v_quotedamount === undefined ? null : toMoneyNumber(row.v_quotedamount)
  const paymentStatus = row.v_paymentstatus || (row.v_requeststatus === 'Paid' ? 'Paid' : '')
  const receipt = paymentStatus === 'Paid' && row.v_receiptnumber
    ? serviceReceiptDto(row, serviceName, quotedAmount)
    : null
  return {
    referenceNumber: row.v_referencenumber,
    kind: 'Service',
    serviceName,
    projectName: row.v_projectname,
    establishmentName: row.v_establishmentname,
    contactPerson: row.v_contactperson,
    contactNumber: row.v_contactnumber,
    problemDescription: row.v_problemdescription,
    projectAddress: row.v_projectaddress,
    preferredDate: dateOnly(row.v_preferreddate),
    preferredTime: timeOnly(row.v_preferredtime),
    recurrenceFrequency: recurrenceFromRemarks(row.v_customerremarks),
    priorityLevel: row.v_prioritylevel,
    customerRemarks: stripRecurrenceFromRemarks(row.v_customerremarks),
    status: row.v_requeststatus,
    submittedAt: row.v_submittedat,
    updatedAt: row.v_updatedat,
    completedAt: row.v_completedat,
    totalAmount: quotedAmount,
    quotation: quotedAmount !== null ? serviceQuotationDto(row, serviceName, quotedAmount) : null,
    payment: paymentStatus ? {
      referenceNumber: row.v_referencenumber,
      status: paymentStatus,
      amount: quotedAmount,
      currency: 'PHP',
      paymentMethod: row.v_paymentmethod || 'Mock payment',
      receiptNumber: row.v_receiptnumber || '',
      paidAt: row.v_paidat || null,
    } : null,
    receipt,
  }
}

function serviceQuotationDto(row, serviceName, amount) {
  return {
    referenceNumber: `SQUO-${row.v_referencenumber}`,
    quotationDate: dateOnly(row.v_updatedat) || dateOnly(row.v_submittedat) || manilaNowParts().date,
    subtotal: amount,
    discount: 0,
    total: amount,
    charges: [{
      id: `service-${row.v_servicerequestid || row.v_referencenumber}`,
      type: 'Service charge',
      serviceName,
      description: serviceName || 'Reviewed service',
      quantity: 1,
      unitPrice: amount,
      subtotal: amount,
    }],
  }
}

function serviceReceiptDto(row, serviceName, amount) {
  return {
    receiptNumber: row.v_receiptnumber,
    quotationReference: `SQUO-${row.v_referencenumber}`,
    requestReference: row.v_referencenumber,
    paidAt: row.v_paidat,
    paidAmount: amount,
    customerName: customerName(row),
    serviceDetails: serviceName || row.v_projectname || 'Katala service',
    projectAddress: row.v_projectaddress || '',
    charges: serviceQuotationDto(row, serviceName, amount).charges,
  }
}

function isPayableQuotationStatus(status) {
  return ['accepted', 'approved', 'ready for payment', 'for payment', 'customer confirmed'].includes(String(status || '').toLowerCase())
}

async function loadServiceRequest(userId, referenceNumber) {
  const result = await pool.query(
    `SELECT sr.*, s.v_servicename, u.v_firstname, u.v_lastname, u.v_companyname, u.v_emailaddress
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
       JOIN public.tbl_user u ON u.v_userid = sr.v_userid
      WHERE sr.v_userid = $1 AND sr.v_referencenumber = $2
      LIMIT 1`,
    [userId, referenceNumber],
  )
  if (!result.rowCount) return null
  return serviceRequestDto(result.rows[0], result.rows[0].v_servicename)
}

async function handleConfirmServiceRequest(req, res, userId, referenceNumber) {
  const result = await transaction(async (client) => {
    const columns = await tableColumns('tbl_servicerequest', client)
    const amountColumn = columns.has('v_quotedamount') ? 'v_quotedamount' : ''
    if (!amountColumn) return { missingMigration: true }
    const updated = await client.query(
      `UPDATE public.tbl_servicerequest
          SET v_requeststatus = 'Customer Confirmed',
              v_updatedat = NOW()
        WHERE v_userid = $1
          AND v_referencenumber = $2
          AND LOWER(v_requeststatus) IN ('accepted', 'approved', 'ready for payment', 'for payment', 'customer confirmed')
          AND COALESCE(v_quotedamount, 0) > 0
        RETURNING *`,
      [userId, referenceNumber],
    )
    if (!updated.rowCount) return null
    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequeststatushistoryid, v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, 'Customer Confirmed', 'Confirmed by customer')`,
      [randomUUID(), updated.rows[0].v_servicerequestid, userId],
    )
    return updated.rows[0]
  })

  if (result?.missingMigration) return sendJson(res, 500, { error: 'Service payment fields are missing. Import database/katala_service_payment_migration.sql in phpMyAdmin.' })
  if (!result) return sendJson(res, 409, { error: 'Service request is not ready for customer confirmation.' })
  const serviceRequest = await loadServiceRequest(userId, referenceNumber)
  return sendJson(res, 200, { ok: true, serviceRequest })
}

async function handleMockServicePayment(req, res, userId, referenceNumber) {
  const result = await transaction(async (client) => {
    const columns = await tableColumns('tbl_servicerequest', client)
    if (!columns.has('v_quotedamount') || !columns.has('v_paymentstatus') || !columns.has('v_receiptnumber') || !columns.has('v_paidat')) {
      return { missingMigration: true }
    }
    const request = await client.query(
      `SELECT *
         FROM public.tbl_servicerequest
        WHERE v_userid = $1
          AND v_referencenumber = $2
        LIMIT 1`,
      [userId, referenceNumber],
    )
    if (!request.rowCount) return { notFound: true }
    const row = request.rows[0]
    const amount = toMoneyNumber(row.v_quotedamount)
    if (!isPayableQuotationStatus(row.v_requeststatus) || amount <= 0) return { notPayable: true }
    if (row.v_paymentstatus === 'Paid' && row.v_receiptnumber) return { paid: row }

    const receipt = row.v_receiptnumber || receiptNumber()
    const updated = await client.query(
      `UPDATE public.tbl_servicerequest
          SET v_requeststatus = 'Paid',
              v_paymentstatus = 'Paid',
              v_receiptnumber = COALESCE(v_receiptnumber, $3),
              v_paidat = COALESCE(v_paidat, NOW()),
              v_updatedat = NOW()
        WHERE v_userid = $1
          AND v_referencenumber = $2
        RETURNING *`,
      [userId, referenceNumber, receipt],
    )
    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequeststatushistoryid, v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, 'Paid', 'Mock payment confirmed by customer')`,
      [randomUUID(), updated.rows[0].v_servicerequestid, userId],
    )
    return { paid: updated.rows[0] }
  })

  if (result?.missingMigration) return sendJson(res, 500, { error: 'Service payment fields are missing. Import database/katala_service_payment_migration.sql in phpMyAdmin.' })
  if (result?.notFound) return sendJson(res, 404, { error: 'Service request not found.' })
  if (result?.notPayable) return sendJson(res, 409, { error: 'This service request is not ready for payment yet.' })
  const serviceRequest = await loadServiceRequest(userId, referenceNumber)
  return sendJson(res, 200, { ok: true, serviceRequest, payment: serviceRequest.payment, receipt: serviceRequest.receipt })
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
        (v_servicerequeststatushistoryid, v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, 'Cancelled', 'Cancelled by customer')`,
      [randomUUID(), row.v_servicerequestid, userId],
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
    `SELECT sr.*, s.v_servicename, u.v_firstname, u.v_lastname, u.v_companyname, u.v_emailaddress
       FROM public.tbl_servicerequest sr
       JOIN public.tbl_service s ON s.v_serviceid = sr.v_serviceid
       JOIN public.tbl_user u ON u.v_userid = sr.v_userid
      WHERE sr.v_userid = $1
      ORDER BY sr.v_submittedat DESC
      LIMIT 50`,
    [userId],
  )
  const notifications = await customerNotifications(userId)

  return sendJson(res, 200, {
    ok: true,
    quotations,
    serviceRequests: services.rows.map((row) => serviceRequestDto(row, row.v_servicename)),
    notifications,
  })
}

async function customerNotifications(userId) {
  if (!(await tableExists('tbl_notification'))) return []
  const columns = await tableColumns('tbl_notification')
  const quotationSelect = columns.has('v_quotationid') ? 'v_quotationid' : 'NULL AS v_quotationid'
  const serviceSelect = columns.has('v_servicerequestid') ? 'v_servicerequestid' : 'NULL AS v_servicerequestid'
  const result = await pool.query(
    `SELECT v_notificationid, ${quotationSelect}, ${serviceSelect}, v_notificationtype, v_notificationtitle, v_notificationmessage, v_isread, v_createdat
       FROM public.tbl_notification
      WHERE v_userid = $1
      ORDER BY v_createdat DESC
      LIMIT 24`,
    [userId],
  )
  const latestBySubject = []
  const seen = new Set()
  for (const row of result.rows) {
    const key = [
      row.v_notificationtype || 'Notification',
      row.v_quotationid ? `quotation:${row.v_quotationid}` : '',
      row.v_servicerequestid ? `service:${row.v_servicerequestid}` : '',
      !row.v_quotationid && !row.v_servicerequestid ? row.v_notificationtitle || row.v_notificationmessage || row.v_notificationid : '',
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    latestBySubject.push(row)
    if (latestBySubject.length >= 8) break
  }
  return latestBySubject.map((row) => ({
    id: row.v_notificationid,
    type: row.v_notificationtype,
    title: row.v_notificationtitle,
    message: row.v_notificationmessage,
    read: Boolean(row.v_isread),
    createdAt: row.v_createdat,
  }))
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

async function staffQuotationItemMap(quotationIds) {
  if (!quotationIds.length) return new Map()
  const variantColumns = await tableColumns('tbl_productvariant')
  const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
  const result = await pool.query(
    `SELECT qpi.v_quotationid, qpi.v_quotationproductitemid, qpi.v_quantity, qpi.v_unitprice, qpi.v_itemdescription,
            pv.v_productvariantid,
            pv.v_productcode, pv.v_productmodel, pv.v_productsize, pv.v_productunit,
            ${stockColumn ? `pv.${stockColumn}` : 'NULL'} AS stock_quantity,
            p.v_productname
       FROM public.tbl_quotationproductitem qpi
       JOIN public.tbl_productvariant pv ON pv.v_productvariantid = qpi.v_productvariantid
       JOIN public.tbl_product p ON p.v_productid = pv.v_productid
      WHERE qpi.v_quotationid = ANY($1::uuid[])
      ORDER BY qpi.v_createdat`,
    [quotationIds],
  )
  const map = new Map()
  for (const row of result.rows) {
    const list = map.get(row.v_quotationid) || []
    const unitPrice = quotationUnitPrice(row.v_unitprice)
    const quantity = Number(row.v_quantity || 0)
    list.push({
      quotationProductItemId: row.v_quotationproductitemid,
      productVariantId: row.v_productvariantid,
      productName: row.v_productname,
      productCode: row.v_productcode,
      productModel: row.v_productmodel,
      productSize: row.v_productsize,
      productUnit: row.v_productunit,
      stock: row.stock_quantity === null || row.stock_quantity === undefined ? null : Number(row.stock_quantity),
      quantity,
      unitPrice,
      lineTotal: unitPrice === null ? null : toMoneyNumber(unitPrice * quantity),
      itemDescription: row.v_itemdescription,
    })
    map.set(row.v_quotationid, list)
  }
  return map
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

function customerUpdateMessage(referenceNumber, status, date, time, staff) {
  const bits = [`${referenceNumber} is now ${status}.`]
  if (date || time) bits.push(`Schedule: ${dateOnly(date) || 'date pending'} ${timeOnly(time) || ''}`.trim())
  if (staff) bits.push(`Assigned staff: ${staff}.`)
  return bits.join(' ')
}

async function createCustomerNotification(client, { userId, quotationId = null, serviceRequestId = null, type, title, message }) {
  if (!(await tableExists('tbl_notification', client))) return
  const columns = await tableColumns('tbl_notification', client)
  const resetRead = columns.has('v_isread') ? ', v_isread = false' : ''
  if (quotationId && columns.has('v_quotationid')) {
    const updated = await client.query(
      `UPDATE public.tbl_notification
          SET v_notificationtitle = $4,
              v_notificationmessage = $5${resetRead}
        WHERE v_userid = $1
          AND v_notificationtype = $2
          AND v_quotationid = $3`,
      [userId, type, quotationId, title, message],
    )
    if (updated.rowCount) return
  }
  if (serviceRequestId && columns.has('v_servicerequestid')) {
    const updated = await client.query(
      `UPDATE public.tbl_notification
          SET v_notificationtitle = $4,
              v_notificationmessage = $5${resetRead}
        WHERE v_userid = $1
          AND v_notificationtype = $2
          AND v_servicerequestid = $3`,
      [userId, type, serviceRequestId, title, message],
    )
    if (updated.rowCount) return
  }
  const insert = buildInsert('tbl_notification', {
    v_userid: userId,
    v_quotationid: columns.has('v_quotationid') ? quotationId : undefined,
    v_servicerequestid: columns.has('v_servicerequestid') ? serviceRequestId : undefined,
    v_notificationtype: type,
    v_notificationtitle: title,
    v_notificationmessage: message,
    ...(columns.has('v_isread') ? { v_isread: false } : {}),
  })
  if (insert) await client.query(insert.sql, insert.params)
}

async function handleStaffWorkQueue(req, res) {
  const [quotations, serviceRequests] = await Promise.all([staffQuotationRows(), staffServiceRows()])
  const quotationItems = await staffQuotationItemMap(quotations.map((row) => row.v_quotationid))
  const items = [
    ...quotations.map((row) => {
      const rowItems = quotationItems.get(row.v_quotationid) || []
      const totals = quotationTotals(row, rowItems)
      return {
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
        completedAt: row.v_completedat,
        quotationDate: dateOnly(row.v_quotationdate),
        preferredDate: dateOnly(row.v_scheduleddate),
        preferredTime: timeOnly(row.v_scheduledtime),
        staff: row.v_assignedstaff,
        projectAddress: row.v_projectaddress,
        projectDescription: row.v_projectdescription,
        customerRemarks: row.v_customerremarks,
        additionalCost: totals.additionalCost,
        totalAmount: totals.totalAmount,
        items: rowItems,
      }
    }),
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
      completedAt: row.v_completedat,
      projectAddress: row.v_projectaddress,
      preferredDate: dateOnly(row.v_preferreddate),
      preferredTime: timeOnly(row.v_preferredtime),
      recurrenceFrequency: recurrenceFromRemarks(row.v_customerremarks),
      customerRemarks: stripRecurrenceFromRemarks(row.v_customerremarks),
      problemDescription: row.v_problemdescription,
      totalAmount: row.v_quotedamount === null || row.v_quotedamount === undefined ? null : toMoneyNumber(row.v_quotedamount),
      quotation: row.v_quotedamount === null || row.v_quotedamount === undefined ? null : serviceQuotationDto(row, row.v_servicename, toMoneyNumber(row.v_quotedamount)),
      payment: row.v_paymentstatus ? {
        referenceNumber: row.v_referencenumber,
        status: row.v_paymentstatus,
        amount: toMoneyNumber(row.v_quotedamount),
        currency: 'PHP',
        receiptNumber: row.v_receiptnumber || '',
        paidAt: row.v_paidat || null,
      } : null,
    })),
  ].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))

  return sendJson(res, 200, { ok: true, items })
}

async function handleStaffUpdateQuotation(req, res, staffUser, referenceNumber) {
  const body = await readBody(req)
  const notifyCustomer = body.notifyCustomer !== false
  const status = clean(body.status, 80) || 'Under Review'
  const additionalCost = staffQuotationAdjustment(body)
  const quotationDate = nullable(body.quotationDate, 20)
  const validUntil = nullable(body.validUntil, 20)
  const schedule = body.schedule && typeof body.schedule === 'object' ? body.schedule : {}
  const scheduledDate = nullable(schedule.date, 20)
  const scheduledTime = normalizePreferredTime(nullable(schedule.time, 20))
  const assignedStaff = nullable(schedule.staff, 160)
  const remarks = nullable(body.remarks, 1000)
  if (body.additionalCost !== '' && body.additionalCost !== null && body.additionalCost !== undefined) {
    const rawAdditionalCost = Number(body.additionalCost)
    if (!Number.isFinite(rawAdditionalCost)) {
      return sendJson(res, 400, { error: 'Quotation adjustment must be a valid number.' })
    }
  }
  const chargeError = validateStaffQuotationCharges(body.charges)
  if (chargeError) return sendJson(res, 400, { error: chargeError })
  if (isPayableQuotationStatus(status) && submittedQuotationTotal(body) <= 0) {
    return sendJson(res, 400, { error: 'Final total must be greater than zero before customer payment.' })
  }
  if (quotationDate && (!validIsoDate(quotationDate) || quotationDate < manilaNowParts().date)) {
    return sendJson(res, 400, { error: 'Quotation date cannot be in the past.' })
  }
  if (validUntil && (!validIsoDate(validUntil) || validUntil < manilaNowParts().date)) {
    return sendJson(res, 400, { error: 'Quotation validity date cannot be in the past.' })
  }
  const scheduleError = validatePreferredSchedule(scheduledDate, scheduledTime)
  if (scheduleError) return sendJson(res, 400, { error: scheduleError })

  const result = await transaction(async (client) => {
    const quotationColumns = await tableColumns('tbl_quotation', client)
    const params = [referenceNumber]
    const assignments = ['v_quotationstatus = $2']
    params.push(status)

    if (additionalCost !== null) {
      params.push(additionalCost)
      assignments.push(`v_additionalcost = $${params.length}`)
    }
    if (validUntil) {
      params.push(validUntil)
      assignments.push(`v_validuntil = $${params.length}::date`)
    }
    if (quotationDate && quotationColumns.has('v_quotationdate')) {
      params.push(quotationDate)
      assignments.push(`v_quotationdate = $${params.length}::date`)
    }
    if (scheduledDate && quotationColumns.has('v_scheduleddate')) {
      params.push(scheduledDate)
      assignments.push(`v_scheduleddate = $${params.length}::date`)
    }
    if (scheduledTime && quotationColumns.has('v_scheduledtime')) {
      params.push(scheduledTime)
      assignments.push(`v_scheduledtime = $${params.length}::time`)
    }
    if (assignedStaff !== null && quotationColumns.has('v_assignedstaff')) {
      params.push(assignedStaff)
      assignments.push(`v_assignedstaff = $${params.length}`)
    }
    if (status.toLowerCase() === 'completed' && quotationColumns.has('v_completedat')) {
      assignments.push('v_completedat = NOW()')
    }
    assignments.push('v_updatedat = NOW()')

    const updated = await client.query(
      `UPDATE public.tbl_quotation
          SET ${assignments.join(', ')}
        WHERE v_referencenumber = $1
        RETURNING *`,
      params,
    )
    if (!updated.rowCount) return null
    await updateQuotationProductPrices(client, updated.rows[0].v_quotationid, body.charges)
    await client.query(
      `INSERT INTO public.tbl_quotationstatushistory
        (v_quotationid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, $4)`,
      [updated.rows[0].v_quotationid, staffUser.id, status, remarks || `Updated by ${staffUser.role}`],
    )
    if (notifyCustomer) {
      await createCustomerNotification(client, {
        userId: updated.rows[0].v_userid,
        quotationId: updated.rows[0].v_quotationid,
        type: 'Quotation',
        title: `Quotation ${status}`,
        message: customerUpdateMessage(updated.rows[0].v_referencenumber, status, scheduledDate, scheduledTime, assignedStaff),
      })
    }
    return updated.rows[0]
  })

  if (!result) return sendJson(res, 404, { error: 'Quotation not found.' })
  const quotation = await loadQuotation(result.v_userid, referenceNumber)
  return sendJson(res, 200, { ok: true, quotation })
}

function validateStaffQuotationCharges(charges) {
  if (charges === undefined) return ''
  if (!Array.isArray(charges)) return 'Quotation charges must be a list.'
  for (const charge of charges) {
    if (!charge || typeof charge !== 'object') return 'Quotation charges must be valid charge items.'
    if (!isMaterialCharge(charge)) continue
    const unitPrice = Number(charge.unitPrice)
    const quantity = Number(charge.quantity)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return 'Material unit prices must be non-negative numbers.'
    if (!Number.isInteger(quantity) || quantity < 1) return 'Material quantities must be whole numbers greater than zero.'
  }
  return ''
}

function staffQuotationAdjustment(body) {
  if (Array.isArray(body.charges)) {
    const materialSubtotal = body.charges
      .filter(isMaterialCharge)
      .reduce((sum, charge) => {
        const quantity = Number(charge.quantity || 0)
        const unitPrice = Number(charge.unitPrice || 0)
        return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0)
      }, 0)
    const submittedTotal = Number(body.quotationTotal ?? body.total ?? body.finalTotal)
    const fallbackTotal = Number(body.additionalCost)
    const total = Number.isFinite(submittedTotal) ? submittedTotal : fallbackTotal
    return Number.isFinite(total) ? toMoneyNumber(total - materialSubtotal) : null
  }
  return body.additionalCost === '' || body.additionalCost === null || body.additionalCost === undefined
    ? null
    : toMoneyNumber(body.additionalCost)
}

function submittedQuotationTotal(body) {
  const submittedTotal = Number(body.quotationTotal ?? body.total ?? body.finalTotal)
  if (Number.isFinite(submittedTotal)) return submittedTotal
  const charges = Array.isArray(body.charges) ? body.charges : []
  const subtotal = charges.reduce((sum, charge) => {
    const quantity = Number(charge?.quantity || 0)
    const unitPrice = Number(charge?.unitPrice || 0)
    return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0)
  }, 0)
  const additionalCost = Number(body.additionalCost || 0)
  return subtotal + (Number.isFinite(additionalCost) ? additionalCost : 0)
}

function servicePriceHistory(rawHistory, amount, staffUser, status) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return rawHistory || null
  let entries = []
  if (Array.isArray(rawHistory)) entries = rawHistory
  else if (typeof rawHistory === 'string' && rawHistory.trim()) {
    try {
      const parsed = JSON.parse(rawHistory)
      if (Array.isArray(parsed)) entries = parsed
    } catch {
      entries = []
    }
  }
  return JSON.stringify([
    ...entries,
    {
      amount: toMoneyNumber(amount),
      status,
      staffUserId: staffUser?.id || '',
      staffRole: staffUser?.role || '',
      savedAt: new Date().toISOString(),
    },
  ].slice(-25))
}

async function updateQuotationProductPrices(client, quotationId, charges) {
  if (!Array.isArray(charges) || !charges.length) return
  for (const charge of charges.filter(isMaterialCharge)) {
    const unitPrice = toMoneyNumber(charge.unitPrice)
    const quantity = Number(charge.quantity)
    const description = nullable(charge.description, 1000)
    const quotationProductItemId = clean(charge.quotationProductItemId, 80)
    const productVariantId = clean(charge.productVariantId, 80)
    const materialCode = clean(charge.materialCode, 120)

    if (quotationProductItemId) {
      await client.query(
        `UPDATE public.tbl_quotationproductitem
            SET v_unitprice = $3,
                v_quantity = $4,
                v_itemdescription = COALESCE($5, v_itemdescription)
          WHERE v_quotationid = $1
            AND v_quotationproductitemid = $2`,
        [quotationId, quotationProductItemId, unitPrice, quantity, description],
      )
    } else if (productVariantId) {
      await client.query(
        `UPDATE public.tbl_quotationproductitem
            SET v_unitprice = $3,
                v_quantity = $4,
                v_itemdescription = COALESCE($5, v_itemdescription)
          WHERE v_quotationid = $1
            AND v_productvariantid = $2`,
        [quotationId, productVariantId, unitPrice, quantity, description],
      )
    } else if (materialCode) {
      await client.query(
        `UPDATE public.tbl_quotationproductitem qpi
            SET v_unitprice = $3,
                v_quantity = $4,
                v_itemdescription = COALESCE($5, qpi.v_itemdescription)
           FROM public.tbl_productvariant pv
          WHERE qpi.v_quotationid = $1
            AND qpi.v_productvariantid = pv.v_productvariantid
            AND LOWER(pv.v_productcode) = LOWER($2)`,
        [quotationId, materialCode, unitPrice, quantity, description],
      )
    }
  }
}

function isMaterialCharge(charge) {
  const type = String(charge?.type || '').trim().toLowerCase()
  return type === 'materials charge' || type === 'material charge' || type === 'materials' || type === 'material'
}

async function handleStaffUpdateServiceRequest(req, res, staffUser, referenceNumber) {
  const body = await readBody(req)
  const notifyCustomer = body.notifyCustomer !== false
  const status = clean(body.status, 80) || 'Under Review'
  const quotedAmount = body.quotedAmount !== undefined ? toMoneyNumber(body.quotedAmount) : submittedQuotationTotal(body)
  const preferredDate = nullable(body.preferredDate, 20)
  const preferredTime = normalizePreferredTime(nullable(body.preferredTime, 20))
  if (body.recurrenceFrequency !== undefined && !isSupportedRecurrenceFrequency(body.recurrenceFrequency)) {
    return sendJson(res, 400, { error: 'Invalid recurrence frequency.' })
  }
  const recurrenceFrequency = body.recurrenceFrequency === undefined ? '' : normalizeRecurrenceFrequency(body.recurrenceFrequency)
  const remarks = nullable(body.remarks, 1000)
  const scheduleError = validatePreferredSchedule(preferredDate, preferredTime)
  if (scheduleError) return sendJson(res, 400, { error: scheduleError })
  if (isPayableQuotationStatus(status) && quotedAmount <= 0) {
    return sendJson(res, 400, { error: 'Final total must be greater than zero before customer payment.' })
  }

  const result = await transaction(async (client) => {
    const columns = await tableColumns('tbl_servicerequest', client)
    const existing = await client.query(
      `SELECT *
         FROM public.tbl_servicerequest
        WHERE v_referencenumber = $1
        LIMIT 1`,
      [referenceNumber],
    )
    const nextRemarks = recurrenceFrequency
      ? customerRemarksWithRecurrence(stripRecurrenceFromRemarks(existing.rows[0]?.v_customerremarks), recurrenceFrequency)
      : existing.rows[0]?.v_customerremarks

    const priceHistory = columns.has('v_pricehistory')
      ? servicePriceHistory(existing.rows[0]?.v_pricehistory, quotedAmount, staffUser, status)
      : undefined
    const update = buildUpdate('tbl_servicerequest', 'v_referencenumber', referenceNumber, {
      v_requeststatus: status,
      ...(preferredDate || preferredTime ? { v_preferreddate: preferredDate, v_preferredtime: preferredTime } : {}),
      v_customerremarks: nextRemarks,
      ...(status.toLowerCase() === 'completed' && columns.has('v_completedat') ? { v_completedat: new Date() } : {}),
      ...(columns.has('v_quotedamount') && quotedAmount > 0 ? { v_quotedamount: quotedAmount } : {}),
      ...(columns.has('v_paymentstatus') && isPayableQuotationStatus(status) ? { v_paymentstatus: 'Pending' } : {}),
      ...(columns.has('v_pricehistory') && priceHistory ? { v_pricehistory: priceHistory } : {}),
      ...(columns.has('v_updatedat') ? { v_updatedat: new Date() } : {}),
    })
    const updated = await client.query(update.sql, update.params)
    if (!updated.rowCount) return null
    await client.query(
      `INSERT INTO public.tbl_servicerequeststatushistory
        (v_servicerequeststatushistoryid, v_servicerequestid, v_updatedbyuserid, v_status, v_statusremarks)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), updated.rows[0].v_servicerequestid, staffUser.id, status, remarks || `Updated by ${staffUser.role}`],
    )
    if (notifyCustomer) {
      await createCustomerNotification(client, {
        userId: updated.rows[0].v_userid,
        serviceRequestId: updated.rows[0].v_servicerequestid,
        type: 'Service Request',
        title: `Service request ${status}`,
        message: customerUpdateMessage(updated.rows[0].v_referencenumber, status, preferredDate, preferredTime, null),
      })
    }
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
  const body = await readBody(req, 1_000_000)
  const name = clean(body.name, 180)
  const sku = clean(body.sku, 80)
  if (!name || !sku) return sendJson(res, 400, { error: 'Material name and SKU are required.' })

  await transaction(async (client) => {
    const productColumns = await tableColumns('tbl_product', client)
    const variantColumns = await tableColumns('tbl_productvariant', client)
    const categoryColumn = firstColumn(productColumns, ['v_productcategory', 'v_category', 'v_producttype'])
    const categoryIdColumn = productColumns.has('v_productcategoryid') ? 'v_productcategoryid' : ''
    const productImageColumn = firstColumn(productColumns, ['v_productimageurl', 'v_imageurl', 'v_image_url'])
    const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
    const reorderColumn = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])
    const variantImageColumn = firstColumn(variantColumns, ['v_variantimageurl', 'v_productimageurl', 'v_imageurl', 'v_image_url'])
    const variantDescriptionColumn = firstColumn(variantColumns, ['v_variantdescription', 'v_description'])
    const minPriceColumn = firstColumn(variantColumns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
    const maxPriceColumn = firstColumn(variantColumns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])
    const categoryId = categoryIdColumn
      ? await resolveCategoryId(client, 'tbl_productcategory', 'v_productcategoryid', 'v_categoryname', body.category, 'Uncategorized')
      : null

    const productInsert = buildInsert('tbl_product', {
      v_productname: name,
      v_isactive: true,
      ...(categoryIdColumn ? { [categoryIdColumn]: categoryId } : {}),
      ...(categoryColumn ? { [categoryColumn]: nullable(body.category, 120) } : {}),
      ...(productImageColumn ? { [productImageColumn]: imageInput(body.imageUrl) } : {}),
    })
    const product = await client.query(productInsert.sql, productInsert.params)

    const variantInsert = buildInsert('tbl_productvariant', {
      v_productid: product.rows[0].v_productid,
      v_productcode: sku,
      v_productmodel: nullable(body.model, 120) || sku,
      v_productsize: nullable(body.size, 80),
      v_productunit: nullable(body.unit, 40) || 'unit',
      v_isactive: true,
      ...(variantDescriptionColumn ? { [variantDescriptionColumn]: nullable(body.description, 1200) } : {}),
      ...(variantImageColumn ? { [variantImageColumn]: imageInput(body.imageUrl) } : {}),
      ...(stockColumn ? { [stockColumn]: Number(body.stock || 0) } : {}),
      ...(reorderColumn ? { [reorderColumn]: Number(body.reorderLevel || 0) } : {}),
      ...(minPriceColumn ? { [minPriceColumn]: nullableMoney(body.minPrice) } : {}),
      ...(maxPriceColumn ? { [maxPriceColumn]: nullableMoney(body.maxPrice) } : {}),
    })
    await client.query(variantInsert.sql, variantInsert.params)
  })

  return sendJson(res, 201, { ok: true, materials: await listMaterials() })
}

async function handleUpdateMaterial(req, res, variantId) {
  if (!isUuid(variantId)) return sendJson(res, 400, { error: 'Invalid material id.' })
  const body = await readBody(req, 1_000_000)
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
    const categoryIdColumn = productColumns.has('v_productcategoryid') ? 'v_productcategoryid' : ''
    const productImageColumn = firstColumn(productColumns, ['v_productimageurl', 'v_imageurl', 'v_image_url'])
    const stockColumn = firstColumn(variantColumns, ['v_stockquantity', 'v_stockqty', 'v_quantityonhand', 'v_quantity'])
    const reorderColumn = firstColumn(variantColumns, ['v_reorderlevel', 'v_reorderpoint'])
    const variantImageColumn = firstColumn(variantColumns, ['v_variantimageurl', 'v_productimageurl', 'v_imageurl', 'v_image_url'])
    const variantDescriptionColumn = firstColumn(variantColumns, ['v_variantdescription', 'v_description'])
    const minPriceColumn = firstColumn(variantColumns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
    const maxPriceColumn = firstColumn(variantColumns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])
    const categoryId = categoryIdColumn && body.category !== undefined
      ? await resolveCategoryId(client, 'tbl_productcategory', 'v_productcategoryid', 'v_categoryname', body.category, 'Uncategorized')
      : undefined

    const productUpdate = buildUpdate('tbl_product', 'v_productid', variant.rows[0].v_productid, {
      v_productname: body.name === undefined ? undefined : clean(body.name, 180),
      ...(categoryIdColumn && body.category !== undefined ? { [categoryIdColumn]: categoryId } : {}),
      ...(categoryColumn && body.category !== undefined ? { [categoryColumn]: nullable(body.category, 120) } : {}),
      ...(productImageColumn && body.imageUrl !== undefined ? { [productImageColumn]: imageInput(body.imageUrl) } : {}),
      ...(productColumns.has('v_updatedat') ? { v_updatedat: new Date() } : {}),
    })
    if (productUpdate) await client.query(productUpdate.sql, productUpdate.params)

    const variantUpdate = buildUpdate('tbl_productvariant', 'v_productvariantid', variantId, {
      v_productcode: body.sku === undefined ? undefined : clean(body.sku, 80),
      v_productmodel: body.model === undefined ? undefined : nullable(body.model, 120),
      v_productsize: body.size === undefined ? undefined : nullable(body.size, 80),
      v_productunit: body.unit === undefined ? undefined : nullable(body.unit, 40),
      v_isactive: body.active === undefined ? undefined : Boolean(body.active),
      ...(variantDescriptionColumn && body.description !== undefined ? { [variantDescriptionColumn]: nullable(body.description, 1200) } : {}),
      ...(variantImageColumn && body.imageUrl !== undefined ? { [variantImageColumn]: imageInput(body.imageUrl) } : {}),
      ...(stockColumn && body.stock !== undefined ? { [stockColumn]: Number(body.stock || 0) } : {}),
      ...(reorderColumn && body.reorderLevel !== undefined ? { [reorderColumn]: Number(body.reorderLevel || 0) } : {}),
      ...(minPriceColumn && body.minPrice !== undefined ? { [minPriceColumn]: nullableMoney(body.minPrice) } : {}),
      ...(maxPriceColumn && body.maxPrice !== undefined ? { [maxPriceColumn]: nullableMoney(body.maxPrice) } : {}),
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
  const body = await readBody(req, 1_000_000)
  const name = clean(body.name, 180)
  const code = clean(body.code, 80)
  if (!name || !code) return sendJson(res, 400, { error: 'Service name and code are required.' })

  const columns = await tableColumns('tbl_service')
  const categoryColumn = firstColumn(columns, ['v_servicecategory', 'v_category'])
  const categoryIdColumn = columns.has('v_servicecategoryid') ? 'v_servicecategoryid' : ''
  const durationColumn = firstColumn(columns, ['v_estimatedduration', 'v_duration'])
  const descriptionColumn = firstColumn(columns, ['v_servicedescription', 'v_description'])
  const imageColumn = firstColumn(columns, ['v_serviceimageurl', 'v_imageurl', 'v_image_url'])
  const minPriceColumn = firstColumn(columns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
  const maxPriceColumn = firstColumn(columns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])
  const categoryId = categoryIdColumn
    ? await resolveCategoryId(pool, 'tbl_servicecategory', 'v_servicecategoryid', 'v_categoryname', body.category, 'Services')
    : null
  const insert = buildInsert('tbl_service', {
    v_servicecode: code,
    v_servicename: name,
    v_isactive: Boolean(body.active ?? true),
    ...(categoryIdColumn ? { [categoryIdColumn]: categoryId } : {}),
    ...(categoryColumn ? { [categoryColumn]: nullable(body.category, 120) } : {}),
    ...(durationColumn ? { [durationColumn]: nullable(body.duration, 120) } : {}),
    ...(descriptionColumn ? { [descriptionColumn]: nullable(body.description, 1200) } : {}),
    ...(imageColumn ? { [imageColumn]: imageInput(body.imageUrl) } : {}),
    ...(minPriceColumn ? { [minPriceColumn]: nullableMoney(body.minPrice) } : {}),
    ...(maxPriceColumn ? { [maxPriceColumn]: nullableMoney(body.maxPrice) } : {}),
  })
  await pool.query(insert.sql, insert.params)
  return sendJson(res, 201, { ok: true, services: await listServices() })
}

async function handleUpdateServiceAdmin(req, res, serviceId) {
  if (!isUuid(serviceId)) return sendJson(res, 400, { error: 'Invalid service id.' })
  const body = await readBody(req, 1_000_000)
  const columns = await tableColumns('tbl_service')
  const categoryColumn = firstColumn(columns, ['v_servicecategory', 'v_category'])
  const categoryIdColumn = columns.has('v_servicecategoryid') ? 'v_servicecategoryid' : ''
  const durationColumn = firstColumn(columns, ['v_estimatedduration', 'v_duration'])
  const descriptionColumn = firstColumn(columns, ['v_servicedescription', 'v_description'])
  const imageColumn = firstColumn(columns, ['v_serviceimageurl', 'v_imageurl', 'v_image_url'])
  const minPriceColumn = firstColumn(columns, ['v_minprice', 'v_min_price', 'v_pricemin', 'v_price_min'])
  const maxPriceColumn = firstColumn(columns, ['v_maxprice', 'v_max_price', 'v_pricemax', 'v_price_max'])
  const categoryId = categoryIdColumn && body.category !== undefined
    ? await resolveCategoryId(pool, 'tbl_servicecategory', 'v_servicecategoryid', 'v_categoryname', body.category, 'Services')
    : undefined
  const update = buildUpdate('tbl_service', 'v_serviceid', serviceId, {
    v_servicecode: body.code === undefined ? undefined : clean(body.code, 80),
    v_servicename: body.name === undefined ? undefined : clean(body.name, 180),
    v_isactive: body.active === undefined ? undefined : Boolean(body.active),
    ...(categoryIdColumn && body.category !== undefined ? { [categoryIdColumn]: categoryId } : {}),
    ...(categoryColumn && body.category !== undefined ? { [categoryColumn]: nullable(body.category, 120) } : {}),
    ...(durationColumn && body.duration !== undefined ? { [durationColumn]: nullable(body.duration, 120) } : {}),
    ...(descriptionColumn && body.description !== undefined ? { [descriptionColumn]: nullable(body.description, 1200) } : {}),
    ...(imageColumn && body.imageUrl !== undefined ? { [imageColumn]: imageInput(body.imageUrl) } : {}),
    ...(minPriceColumn && body.minPrice !== undefined ? { [minPriceColumn]: nullableMoney(body.minPrice) } : {}),
    ...(maxPriceColumn && body.maxPrice !== undefined ? { [maxPriceColumn]: nullableMoney(body.maxPrice) } : {}),
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
  if (error.message === 'XENDIT_NOT_CONFIGURED') return 'Xendit is not configured yet. Set XENDIT_SECRET_KEY in .env.'
  if (error.message === 'XENDIT_API_ERROR') return error.publicMessage || 'Xendit rejected the payment request.'
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
  if (error.code === 'ER_NO_SUCH_TABLE') return 'A required MySQL table is missing. Import database/katala_xampp_mysql_schema.sql in phpMyAdmin.'
  if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === '28P01') return 'The database rejected the configured credentials. Check your database settings in .env.'
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) return 'The API could not reach the database. Check that XAMPP MySQL is running and your .env database settings are correct.'
  return null
}

async function reportDatabaseReadiness() {
  if (!pool) return

  try {
    await pool.query('SELECT 1')
    const hasProductVariants = await tableExists('tbl_productvariant')
    const productCountSql = hasProductVariants
      ? '(SELECT COUNT(*)::int FROM public.tbl_productvariant WHERE v_isactive = TRUE)'
      : '(SELECT COUNT(*)::int FROM public.tbl_product WHERE v_isActive = TRUE)'
    const result = await pool.query(`
      SELECT
        ${productCountSql} AS product_variants,
        (SELECT COUNT(*)::int FROM public.tbl_service WHERE v_isActive = TRUE) AS services
    `)

    const counts = result.rows[0] || {}
    console.log('Database connection: verified')
    console.log(`Catalog readiness: ${counts.product_variants || 0} active product record(s), ${counts.services || 0} active service(s)`)

    if (!counts.product_variants || !counts.services) {
      console.warn('Catalog/service data is incomplete. Import database/katala_xampp_mysql_schema.sql in phpMyAdmin before testing quotation/service submissions.')
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
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (isRateLimited(req, url)) return sendJson(res, 429, { error: 'Too many requests. Please wait a few seconds and try again.' })
  const quotationMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)$/)
  const quotationConfirmMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/confirm$/)
  const quotationMockPaymentMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/mock-payment$/)
  const quotationCheckoutMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/paymongo-checkout$/)
  const quotationXenditCheckoutMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/xendit-checkout$/)
  const serviceRequestMatch = url.pathname.match(/^\/api\/service-requests\/([^/]+)$/)
  const serviceRequestConfirmMatch = url.pathname.match(/^\/api\/service-requests\/([^/]+)\/confirm$/)
  const serviceRequestMockPaymentMatch = url.pathname.match(/^\/api\/service-requests\/([^/]+)\/mock-payment$/)
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
        authProvider: 'local',
        mysqlConfigured: Boolean(useMysql),
        paymongoConfigured: Boolean(paymongoSecretKey),
        xenditConfigured: Boolean(xenditSecretKey),
        message: pool
          ? 'API, database, and local MySQL auth are configured.'
          : 'Configuration is incomplete. Check your database and auth environment variables.',
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/paymongo/webhook') {
      return await handlePaymongoWebhook(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/api/xendit/webhook') {
      return await handleXenditWebhook(req, res)
    }

    if (url.pathname.startsWith('/api/')) {
      if (!requireDatabase(res)) return

      if (req.method === 'GET' && url.pathname === '/api/catalog/materials') {
        const materials = (await listMaterials()).filter((item) => item.active)
        return sendJson(res, 200, { ok: true, materials })
      }
      if (req.method === 'GET' && url.pathname === '/api/catalog/services') {
        const services = (await listServices()).filter((item) => item.active)
        return sendJson(res, 200, { ok: true, services })
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/register-profile') {
        return await handleRegisterProfile(req, res)
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
        return await handleLocalSignup(req, res)
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
        return await handleLocalSignin(req, res)
      }

      if (url.pathname.startsWith('/api/admin/')) {
        const adminUser = await requirePortalUser(req, res, ['admin'])
        if (!adminUser) return

        if (req.method === 'GET' && url.pathname === '/api/admin/accounts') return await handleListAccounts(req, res)
        if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') return await handleAdminDashboard(req, res)
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
        if (req.method === 'GET' && url.pathname === '/api/staff/members') return await handleListStaffMembers(req, res)
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
      if (quotationConfirmMatch && req.method === 'POST') return await handleConfirmQuotation(req, res, userId, decodeURIComponent(quotationConfirmMatch[1]))
      if (quotationMockPaymentMatch && req.method === 'POST') return await handleMockQuotationPayment(req, res, userId, decodeURIComponent(quotationMockPaymentMatch[1]))
      if (quotationCheckoutMatch && req.method === 'POST') return await handleCreatePaymongoCheckout(req, res, userId, decodeURIComponent(quotationCheckoutMatch[1]))
      if (quotationXenditCheckoutMatch && req.method === 'POST') return await handleCreateXenditCheckout(req, res, userId, decodeURIComponent(quotationXenditCheckoutMatch[1]))
      if (quotationMatch && req.method === 'GET') return await handleGetQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'PATCH') return await handleUpdateQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'DELETE') return await handleCancelQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))

      const receiptMatch = url.pathname.match(/^\/api\/payments\/([^/]+)\/receipt$/)
      if (receiptMatch && req.method === 'GET') return await handleGetReceipt(req, res, userId, decodeURIComponent(receiptMatch[1]))

      if (req.method === 'POST' && url.pathname === '/api/service-requests') return await handleCreateServiceRequest(req, res, userId)
      if (serviceRequestConfirmMatch && req.method === 'POST') return await handleConfirmServiceRequest(req, res, userId, decodeURIComponent(serviceRequestConfirmMatch[1]))
      if (serviceRequestMockPaymentMatch && req.method === 'POST') return await handleMockServicePayment(req, res, userId, decodeURIComponent(serviceRequestMockPaymentMatch[1]))
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
    if (error.message === 'ASSIGNMENT_REQUIRES_STAFF') return sendJson(res, 400, { error: 'Only staff accounts can receive staff assignment details.' })
    if (error.message === 'STAFF_ASSIGNMENT_SCHEMA_MISSING') return sendJson(res, 409, { error: 'Staff assignment columns are missing. Import the latest XAMPP MySQL schema or migration.' })
    const friendly = friendlyDatabaseError(error)
    return sendJson(res, error.statusCode || 500, { error: friendly || 'Server/database error. No table was created or altered.' })
  }
})

server.listen(port, () => {
  console.log(`Katala API running on http://localhost:${port}`)
  console.log(pool ? 'Database connection: configured' : 'Database connection: not configured')
  console.log('Auth provider: local MySQL')
  void reportDatabaseReadiness()
})
