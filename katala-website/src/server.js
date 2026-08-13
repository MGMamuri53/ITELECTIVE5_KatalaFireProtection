import 'dotenv/config'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const { Pool } = pg
const port = Number(process.env.PORT || 3001)
const databaseUrl = (process.env.DATABASE_URL || '').trim()
const useSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
const appOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/$/, '')

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

function setCors(req, res) {
  const origin = req.headers.origin
  if (!origin) return

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  const isConfiguredApp = appOrigin && origin === appOrigin
  if (isLocal || isConfiguredApp) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Development-User-Id')
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

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64_000) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
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

async function getAuthenticatedUserId(req) {
  const token = getBearerToken(req)
  if (token && supabaseAuth) {
    const { data, error } = await supabaseAuth.auth.getUser(token)
    if (!error && data?.user?.id) return data.user.id
  }

  // Optional local-development fallback. Never use this in production.
  if (process.env.NODE_ENV !== 'production') {
    const candidate = clean(req.headers['x-development-user-id'], 80)
    if (isUuid(candidate)) return candidate
  }
  return null
}

async function requireUser(req, res) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    sendJson(res, 401, { error: 'Please sign in with a verified account to continue.' })
    return null
  }
  return userId
}

async function handleSession(req, res, userId) {
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

function quotationDto(row, items = []) {
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
          (v_quotationid, v_productvariantid, v_quantity, v_itemdescription)
         VALUES ($1, $2, $3, $4)`,
        [quotationId, item.variant.v_productvariantid, item.quantity, item.itemDescription],
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
    message: 'Quotation request submitted. Price and availability still require Katala review.',
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
      unitPrice: item.v_unitprice,
      itemDescription: item.v_itemdescription,
    })),
  )
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

function friendlyDatabaseError(error) {
  if (error.message === 'AUTH_SCHEMA_INCOMPATIBLE') return 'Account access is not fully configured yet. Please contact the site administrator.'
  if (error.message === 'AUTH_SCHEMA_REQUIRED_FIELDS') return 'Account creation needs additional server-side configuration. Please contact the site administrator.'
  if (error.message === 'EMAIL_ALREADY_REGISTERED') return 'An account already exists for that email address.'
  if (error.message === 'USER_NOT_FOUND') return 'Your verified login could not be matched to a Katala customer profile.'
  if (error.message === 'ACCOUNT_NOT_ACTIVE') return 'Verify your email before submitting quotations or service requests.'
  if (error.message === 'PRODUCT_VARIANT_NOT_FOUND') return `The selected product option is not available for online quotation yet: ${error.item?.productName || 'product'}${error.item?.productSize ? ` / ${error.item.productSize}` : ''}. Please contact Katala for assistance.`
  if (error.message === 'PRODUCT_VARIANT_AMBIGUOUS') return 'This product option needs manual review before it can be quoted. Please contact Katala.'
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
  const serviceRequestMatch = url.pathname.match(/^\/api\/service-requests\/([^/]+)$/)

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        databaseConfigured: Boolean(pool),
        supabaseAuthConfigured: Boolean(supabaseAuth),
        message: pool && supabaseAuth
          ? 'API, database, and Supabase Auth are configured.'
          : 'Configuration is incomplete. Check DATABASE_URL and Supabase environment variables.',
      })
    }

    if (url.pathname.startsWith('/api/')) {
      if (!requireDatabase(res)) return

      const userId = await requireUser(req, res)
      if (!userId) return

      if (req.method === 'GET' && url.pathname === '/api/auth/session') return await handleSession(req, res, userId)

      if (req.method === 'POST' && url.pathname === '/api/quotations') return await handleCreateQuotation(req, res, userId)
      if (quotationMatch && req.method === 'GET') return await handleGetQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'PATCH') return await handleUpdateQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))
      if (quotationMatch && req.method === 'DELETE') return await handleCancelQuotation(req, res, userId, decodeURIComponent(quotationMatch[1]))

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