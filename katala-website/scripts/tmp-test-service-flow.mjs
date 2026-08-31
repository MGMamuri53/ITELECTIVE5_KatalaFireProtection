import 'dotenv/config'
import fs from 'node:fs/promises'
import mysql from 'mysql2/promise'

const api = `http://localhost:${process.env.PORT || 3001}`
const password = 'TestPass123!'
const runId = Date.now()
const customerEmail = `katala.service.flow.${runId}@example.com`

async function main() {
  await ensureMigration()

  const health = await request('/api/health')
  step('API health', health.ok && health.databaseConfigured)

  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      firstName: 'Flow',
      lastName: 'Tester',
      email: customerEmail,
      password,
      accountType: 'customer',
      contactNumber: '+639171234567',
      companyName: 'Katala Flow Test',
      jobTitle: 'QA',
      industry: 'Testing',
      companyAddress: 'Dasmarinas, Cavite',
    },
  })
  const customerToken = signup.session?.token || signup.session?.access_token
  const customerId = signup.user?.id || signup.session?.user?.id
  step('Customer signup', Boolean(customerToken && customerId), `${customerEmail} / ${customerId}`)

  const catalog = await request('/api/catalog/services')
  const maintenance = catalog.services.find((service) => service.code === 'SYS-MAINT') || catalog.services[0]
  const oneTime = catalog.services.find((service) => service.code === 'SYS-INSTALL') || catalog.services.find((service) => service.serviceId !== maintenance.serviceId)
  step('Service catalog has test services', Boolean(maintenance && oneTime), `${maintenance?.name || 'missing'} / ${oneTime?.name || 'missing'}`)

  const oneTimeResult = await testService({
    label: 'one-time service',
    customerToken,
    staffUserId: customerId,
    serviceName: oneTime.name,
    recurrenceFrequency: 'One-time',
    readyAmount: 4200,
    scheduleDate: '2099-02-01',
    nextDate: '',
    completeAtEnd: true,
  })

  const maintenanceResult = await testService({
    label: 'maintenance service',
    customerToken,
    staffUserId: customerId,
    serviceName: maintenance.name,
    recurrenceFrequency: 'Monthly',
    readyAmount: 3500,
    scheduleDate: '2099-03-01',
    nextDate: '2099-04-01',
    completeAtEnd: false,
  })

  console.log(JSON.stringify({
    ok: true,
    customerEmail,
    oneTime: oneTimeResult,
    maintenance: maintenanceResult,
  }, null, 2))
}

async function testService({ label, customerToken, staffUserId, serviceName, recurrenceFrequency, readyAmount, scheduleDate, nextDate, completeAtEnd }) {
  const created = await request('/api/service-requests', {
    method: 'POST',
    token: customerToken,
    body: {
      serviceName,
      projectName: `${label} project ${runId}`,
      establishmentName: 'Katala Flow Test',
      contactPerson: 'Flow Tester',
      contactNumber: '+639171234567',
      problemDescription: `${label} request created by automated flow test.`,
      projectAddress: 'Dasmarinas, Cavite',
      preferredDate: scheduleDate,
      preferredTime: '13:30',
      recurrenceFrequency,
      priorityLevel: 'Normal',
      customerRemarks: `${label} customer remarks`,
    },
  })
  const ref = created.referenceNumber
  step(`${label}: customer submitted`, Boolean(ref), ref)

  await staffPatch(staffUserId, ref, {
    status: 'Ready for Payment',
    quotedAmount: readyAmount,
    quotationTotal: readyAmount,
    recurrenceFrequency,
    charges: [{
      type: 'Service charge',
      serviceName,
      description: `${serviceName} reviewed charge`,
      quantity: 1,
      unitPrice: readyAmount,
      subtotal: readyAmount,
    }],
    preferredDate: scheduleDate,
    preferredTime: '13:30',
  })
  const ready = await findCustomerItem(customerToken, ref, 'serviceRequests')
  step(`${label}: staff marked ready for payment`, ready?.status === 'Ready for Payment' && Number(ready?.totalAmount) === readyAmount, `${ready?.status} / ${ready?.totalAmount}`)

  const confirmed = await request(`/api/service-requests/${encodeURIComponent(ref)}/confirm`, {
    method: 'POST',
    token: customerToken,
  })
  step(`${label}: customer confirmed quote`, confirmed.serviceRequest?.status === 'Customer Confirmed', confirmed.serviceRequest?.status)

  const paid = await request(`/api/service-requests/${encodeURIComponent(ref)}/mock-payment`, {
    method: 'POST',
    token: customerToken,
  })
  step(`${label}: customer paid`, paid.serviceRequest?.status === 'Paid' && paid.receipt?.receiptNumber, `${paid.serviceRequest?.status} / ${paid.receipt?.receiptNumber || 'no receipt'}`)

  const paidQueueItem = await findStaffItem(staffUserId, ref)
  step(`${label}: visible to paid assignments`, paidQueueItem?.status === 'Paid', paidQueueItem?.status)

  await staffPatch(staffUserId, ref, {
    status: 'Scheduled',
    quotedAmount: readyAmount,
    quotationTotal: readyAmount,
    recurrenceFrequency,
    preferredDate: scheduleDate,
    preferredTime: '14:00',
    remarks: `${label} scheduled by automated flow test`,
  })
  const scheduled = await findStaffItem(staffUserId, ref)
  step(`${label}: staff scheduled`, scheduled?.status === 'Scheduled' && scheduled?.preferredDate === scheduleDate, `${scheduled?.status} / ${scheduled?.preferredDate}`)

  if (completeAtEnd) {
    await staffPatch(staffUserId, ref, {
      status: 'Completed',
      quotedAmount: readyAmount,
      quotationTotal: readyAmount,
      recurrenceFrequency,
      preferredDate: scheduleDate,
      preferredTime: '14:00',
      remarks: `${label} completed by automated flow test`,
    })
    const completed = await findStaffItem(staffUserId, ref)
    step(`${label}: completed`, completed?.status === 'Completed', completed?.status)
    return { referenceNumber: ref, finalStatus: completed?.status, receiptNumber: paid.receipt?.receiptNumber }
  }

  await staffPatch(staffUserId, ref, {
    status: 'Scheduled',
    quotedAmount: readyAmount,
    quotationTotal: readyAmount,
    recurrenceFrequency,
    preferredDate: nextDate,
    preferredTime: '14:00',
    remarks: `${label} first visit done; next schedule set by automated flow test`,
  })
  const nextMaintenance = await findStaffItem(staffUserId, ref)
  step(`${label}: maintenance visit rolls to next schedule`, nextMaintenance?.status === 'Scheduled' && nextMaintenance?.preferredDate === nextDate, `${nextMaintenance?.status} / ${nextMaintenance?.preferredDate}`)
  return { referenceNumber: ref, finalStatus: nextMaintenance?.status, nextDate: nextMaintenance?.preferredDate, receiptNumber: paid.receipt?.receiptNumber }
}

async function ensureMigration() {
  const conn = await mysql.createConnection({
    host: (process.env.DB_HOST || 'localhost') === 'localhost' ? '127.0.0.1' : process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_katala',
    multipleStatements: true,
  })
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tbl_servicerequest'
        AND COLUMN_NAME IN ('v_quotedamount', 'v_paymentstatus', 'v_receiptnumber', 'v_paidat', 'v_pricehistory')`,
  )
  if (cols.length < 5) {
    const sql = await fs.readFile('database/katala_service_payment_migration.sql', 'utf8')
    await conn.query(sql)
    step('Database migration', true, 'applied service payment fields and service seeds')
  } else {
    step('Database migration', true, 'already present')
  }
  await conn.end()
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const response = await fetch(`${api}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed ${response.status}: ${data.error || text}`)
  }
  return data
}

async function staffPatch(userId, referenceNumber, body) {
  const response = await fetch(`${api}/api/staff/service-requests/${encodeURIComponent(referenceNumber)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Development-User-Id': userId,
      'X-Development-Role': 'staff',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(`PATCH staff ${referenceNumber} failed ${response.status}: ${data.error || text}`)
  return data
}

async function findCustomerItem(token, referenceNumber, bucket) {
  const inbox = await request('/api/customer/inbox', { token })
  return (inbox[bucket] || []).find((item) => item.referenceNumber === referenceNumber)
}

async function findStaffItem(userId, referenceNumber) {
  const response = await fetch(`${api}/api/staff/work-queue`, {
    headers: {
      'X-Development-User-Id': userId,
      'X-Development-Role': 'staff',
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(`GET staff work queue failed ${response.status}: ${data.error || text}`)
  return (data.items || []).find((item) => item.referenceNumber === referenceNumber || item.id === referenceNumber)
}

function step(label, passed, detail = '') {
  const marker = passed ? 'PASS' : 'FAIL'
  console.log(`${marker} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!passed) throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`)
}

main().catch((error) => {
  console.error(`FAIL ${error.message || error}`)
  if (error.stack) console.error(error.stack)
  process.exitCode = 1
})
