const WORKFLOW_KEY = 'katala-staff-workflows-v1';
const WORKFLOW_EVENT = 'katala-workflow-changed';

export const WORKFLOW_STATUSES = [
  'Submitted',
  'Under Review',
  'Quotation Draft',
  'Ready for Payment',
  'Customer Confirmed',
  'Paid',
  'Scheduled',
  'In Progress',
  'Completed',
  'Cancelled',
];

export const chargeTypes = [
  'Service charge',
  'Materials charge',
  'Labor charge',
  'Inspection fee',
  'Other custom charge',
];

export const staffMembers = [
  'Mara Santos',
  'Luis Reyes',
  'Andrea Cruz',
  'Paolo Garcia',
  'Katala Duty Team',
];

export const recurrenceOptions = [
  'One-time',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Half-year',
  'Yearly',
];

export function loadWorkflowMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWorkflowMap(map) {
  localStorage.setItem(WORKFLOW_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(WORKFLOW_EVENT));
}

export function subscribeWorkflowChanges(callback) {
  const localListener = () => callback();
  const storageListener = (event) => {
    if (event.key === WORKFLOW_KEY) callback();
  };

  window.addEventListener(WORKFLOW_EVENT, localListener);
  window.addEventListener('storage', storageListener);

  return () => {
    window.removeEventListener(WORKFLOW_EVENT, localListener);
    window.removeEventListener('storage', storageListener);
  };
}

export function getWorkflow(reference) {
  return loadWorkflowMap()[reference] || null;
}

export function upsertWorkflow(reference, patch) {
  const map = loadWorkflowMap();
  const current = map[reference] || {};
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  map[reference] = next;
  saveWorkflowMap(map);
  return next;
}

export function overlayWorkflow(item) {
  const workflow = getWorkflow(item.id || item.referenceNumber) || {};
  const quotation = normalizeQuotation(workflow.quotation, item);
  const status = workflow.status || item.status || 'Under Review';
  return {
    ...item,
    ...workflow,
    status: status === 'Submitted' ? 'Under Review' : status,
    quotation,
    schedule: workflow.schedule || scheduleFromItem(item),
    recurrenceFrequency: workflow.recurrenceFrequency || item.recurrenceFrequency || inferRecurrenceFrequency(item),
    serviceType: workflow.serviceType || inferServiceType(item),
  };
}

export function normalizeQuotation(quotation = {}, item = {}) {
  let charges = Array.isArray(quotation.charges) && quotation.charges.length
    ? quotation.charges.map(normalizeCharge)
    : defaultCharges(item);

  const materialCharges = materialChargesFromItems(item);
  if (materialCharges.length) {
    const materialByKey = new Map(materialCharges.map((charge) => [charge.sourceItemKey, charge]));
    const remainingMaterials = [...materialCharges];
    charges = charges.map((charge) => {
      const material = materialByKey.get(charge.sourceItemKey) || takeMatchingMaterial(remainingMaterials, charge);
      return material
        ? normalizeCharge({
            ...charge,
            type: 'Materials charge',
            materialCode: charge.materialCode || material.materialCode,
            stockOnHand: material.stockOnHand,
            sourceItemKey: material.sourceItemKey,
          })
        : charge;
    });

    const existingMaterialKeys = new Set(charges.map((charge) => charge.sourceItemKey).filter(Boolean));
    const placeholderOnly = charges.length === 1
      && !charges[0].sourceItemKey
      && charges[0].unitPrice === 0
      && /initial service charge|reviewed katala service/i.test(charges[0].description || '');

    if (placeholderOnly) charges = [];

    const missingMaterialCharges = materialCharges.filter((charge) => !existingMaterialKeys.has(charge.sourceItemKey));
    if (missingMaterialCharges.length) charges = [...charges, ...missingMaterialCharges];
    charges = removeDuplicateMaterialCharges(charges);
  }

  const discount = money(quotation.discount);
  const subtotal = money(charges.reduce((sum, charge) => sum + charge.subtotal, 0));

  return {
    referenceNumber: quotation.referenceNumber || `QUO-${item.id || item.referenceNumber || Date.now()}`,
    quotationDate: quotation.quotationDate || today(),
    validUntil: quotation.validUntil || '',
    notes: quotation.notes || '',
    terms: quotation.terms || 'Payment confirms acceptance of the quotation. Schedule is subject to staff availability.',
    additionalFees: 0,
    discount,
    subtotal,
    total: money(Math.max(0, subtotal - discount)),
    charges,
  };
}

export function normalizeCharge(charge = {}) {
  const quantity = charge.quantity === '' ? '' : numberOrDefault(charge.quantity, 1);
  const unitPrice = charge.unitPrice === '' ? '' : money(charge.unitPrice);
  const materialCode = charge.materialCode || materialCodeFromDescription(charge.description);
  return {
    id: charge.id || cryptoId(),
    type: charge.type || chargeTypes[0],
    materialCode,
    stockOnHand: stockOrNull(charge.stockOnHand),
    serviceName: charge.serviceName || '',
    description: cleanMaterialDescription(charge.description, materialCode),
    quantity,
    unitPrice,
    subtotal: money(Number(quantity || 0) * Number(unitPrice || 0)),
    sourceItemKey: charge.sourceItemKey || '',
  };
}

export function buildReceipt(item, payment = {}) {
  const quotation = normalizeQuotation(item.quotation, item);
  const paidAt = payment.paidAt || new Date().toISOString();
  return {
    receiptNumber: payment.receiptNumber || `RCT-${paidAt.slice(0, 10).replaceAll('-', '')}-${String(item.id || item.referenceNumber).replace(/[^A-Z0-9]/gi, '').slice(-6)}`,
    quotationReference: quotation.referenceNumber,
    requestReference: item.id || item.referenceNumber,
    paidAt,
    paidAmount: quotation.total,
    customerName: item.customer || item.customerName || 'Customer',
    serviceDetails: item.subject || item.serviceName || item.projectName || 'Katala service',
    projectAddress: item.projectAddress || '',
    charges: quotation.charges,
  };
}

export function workflowItemsFromQueue(items) {
  return items.map(overlayWorkflow);
}

export function staffSearchFields(item) {
  return [
    item.id,
    item.referenceNumber,
    item.kind,
    item.customer,
    item.customerName,
    item.company,
    item.email,
    item.contactNumber,
    item.subject,
    item.serviceName,
    item.productName,
    item.projectName,
    item.establishmentName,
    item.projectAddress,
    item.schedule?.staff,
    item.staff,
    item.status,
    item.priority,
    item.recurrenceFrequency,
    item.schedule?.date,
    item.schedule?.time,
    item.preferredDate,
    item.preferredTime,
    item.submittedAt,
    item.updatedAt,
    ...(Array.isArray(item.items) ? item.items.flatMap((line) => [
      line.productName,
      line.productCode,
      line.productModel,
      line.productSize,
      line.quantity,
    ]) : []),
  ];
}

export function matchesStaffSearch(item, query) {
  const needle = String(query || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!needle) return true;
  return staffSearchFields(item).some((value) =>
    String(value || '').trim().replace(/\s+/g, ' ').toLowerCase().includes(needle)
  );
}

export function filterStaffItems(items, query) {
  const needle = String(query || '').trim();
  if (!needle) return items;
  return items.filter((item) => matchesStaffSearch(item, needle));
}

export function completeRecurringVisit(item, patch = {}) {
  if (!isRecurringService(item) || patch.maintenanceClosed || patch.status !== 'Completed') {
    return patch;
  }

  const completedSchedule = normalizeSchedule(patch.schedule || item.schedule || scheduleFromItem(item));
  if (!completedSchedule.date) return patch;

  const visitKey = visitScheduleKey(completedSchedule);
  const visits = Array.isArray(item.visits) ? [...item.visits] : [];
  const alreadyRecorded = visits.some((visit) => visitScheduleKey(visit.schedule || visit) === visitKey);
  const nextVisits = alreadyRecorded
    ? visits
    : [
        ...visits,
        {
          completedAt: new Date().toISOString(),
          schedule: completedSchedule,
          staff: completedSchedule.staff || '',
          recurrenceFrequency: patch.recurrenceFrequency || item.recurrenceFrequency || 'Monthly',
        },
      ];
  const anchorDay = Number(item.recurrenceAnchorDay) || dayFromDate(completedSchedule.date);
  const nextDate = nextRecurringDate(completedSchedule.date, patch.recurrenceFrequency || item.recurrenceFrequency || 'Monthly', anchorDay);

  return {
    ...patch,
    status: 'Scheduled',
    serviceType: 'Recurring',
    visits: nextVisits,
    recurrenceAnchorDay: anchorDay,
    lastCompletedVisitKey: visitKey,
    schedule: {
      ...completedSchedule,
      date: nextDate,
    },
  };
}

export function isRecurringService(item) {
  const recurrence = item.recurrenceFrequency || inferRecurrenceFrequency(item);
  if (recurrence && recurrence !== 'One-time') return true;
  const haystack = [
    item.serviceType,
    item.subject,
    item.serviceName,
    item.problemDescription,
    item.customerRemarks,
  ].filter(Boolean).join(' ').toLowerCase();
  return /maintenance|preventive|recurring|regular|monthly|quarterly|annual|yearly/.test(haystack);
}

export function inferRecurrenceFrequency(item) {
  const haystack = [
    item.recurrenceFrequency,
    item.serviceType,
    item.subject,
    item.serviceName,
    item.problemDescription,
    item.customerRemarks,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/weekly|week\b/.test(haystack)) return 'Weekly';
  if (/monthly|month\b/.test(haystack)) return 'Monthly';
  if (/quarterly|quarter\b/.test(haystack)) return 'Quarterly';
  if (/half[-\s]?year|semi[-\s]?annual|semiannual|6\s*months?/.test(haystack)) return 'Half-year';
  if (/yearly|annual|annually|year\b/.test(haystack)) return 'Yearly';
  return /maintenance|preventive|recurring|regular/.test(haystack) ? 'Monthly' : 'One-time';
}

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function defaultCharges(item) {
  const materialCharges = materialChargesFromItems(item);
  if (materialCharges.length) return materialCharges;

  const quoted = money(item.totalAmount || item.additionalCost);
  if (quoted > 0) {
    return [normalizeCharge({
      type: 'Service charge',
      serviceName: item.subject || item.serviceName || 'Reviewed Katala service',
      description: item.subject || item.serviceName || 'Reviewed Katala service',
      quantity: 1,
      unitPrice: quoted,
    })];
  }
  return [normalizeCharge({
    type: 'Service charge',
    serviceName: item.subject || item.serviceName || 'Initial service charge',
    description: item.subject || item.serviceName || 'Initial service charge',
    quantity: 1,
    unitPrice: 0,
  })];
}

function materialChargesFromItems(item) {
  if (!Array.isArray(item.items) || !item.items.length) return [];

  return item.items.map((quotedItem, index) => {
    const sourceItemKey = [
      quotedItem.productVariantId,
      quotedItem.productCode,
      quotedItem.productName,
      index,
    ].filter(Boolean).join('-');

    return normalizeCharge({
      id: `material-${item.id || item.referenceNumber || 'quote'}-${sourceItemKey || index}`,
      type: 'Materials charge',
      materialCode: quotedItem.productCode || '',
      stockOnHand: quotedItem.stock,
      description: materialDescription(quotedItem),
      quantity: quotedItem.quantity || 1,
      unitPrice: quotedItem.unitPrice ?? 0,
      sourceItemKey,
    });
  });
}

function materialDescription(item) {
  const details = [
    item.productSize ? `Size: ${item.productSize}` : '',
    item.productUnit ? `Unit: ${item.productUnit}` : '',
  ].filter(Boolean).join(', ');

  return [
    item.productName,
    details,
    item.itemDescription,
  ].filter(Boolean).join(' - ') || 'Quoted material';
}

function materialCodeFromDescription(description) {
  const match = String(description || '').match(/\bCode:\s*([^,-]+)/i);
  return match ? match[1].trim() : '';
}

function takeMatchingMaterial(materials, charge) {
  const index = materials.findIndex((material) => sameMaterialCharge(material, charge));
  if (index < 0) return null;
  return materials.splice(index, 1)[0];
}

function sameMaterialCharge(material, charge) {
  const materialCode = String(material.materialCode || '').trim().toLowerCase();
  const chargeCode = String(charge.materialCode || materialCodeFromDescription(charge.description)).trim().toLowerCase();
  if (materialCode && chargeCode && materialCode === chargeCode) return true;

  return materialIdentity(material) === materialIdentity(charge)
    && Number(material.quantity) === Number(charge.quantity);
}

function materialIdentity(charge) {
  return cleanMaterialDescription(charge.description || '', charge.materialCode)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function removeDuplicateMaterialCharges(charges) {
  const seen = new Map();
  const duplicateIndexes = new Set();

  charges.forEach((charge, index) => {
    if (charge.type !== 'Materials charge') return;
    const key = [
      charge.sourceItemKey || String(charge.materialCode || '').toLowerCase(),
      materialIdentity(charge),
      charge.quantity,
    ].join('|');
    const previousIndex = seen.get(key);
    if (previousIndex === undefined) {
      seen.set(key, index);
      return;
    }

    const previous = charges[previousIndex];
    if (previous.unitPrice > 0 && charge.unitPrice <= 0) duplicateIndexes.add(index);
    else if (charge.unitPrice > 0 && previous.unitPrice <= 0) {
      duplicateIndexes.add(previousIndex);
      seen.set(key, index);
    } else {
      duplicateIndexes.add(index);
    }
  });

  return charges.filter((_, index) => !duplicateIndexes.has(index));
}

function cleanMaterialDescription(description, materialCode = '') {
  let text = String(description || '');
  if (!text) return '';
  const original = text;

  if (materialCode) {
    text = text.replace(new RegExp(`\\s*-?\\s*Code:\\s*${escapeRegExp(materialCode)}\\s*,?`, 'i'), ' ');
    text = text.replace(new RegExp(`\\s*-?\\s*Model:\\s*${escapeRegExp(materialCode)}\\s*,?`, 'i'), ' ');
  }

  text = text
    .replace(/\s*-?\s*Code:\s*[^,-]+,?/i, ' ')
    .replace(/\s*-?\s*Model:\s*[^,-]+,?/i, ' ');

  if (text === original) return original;

  return text
    .replace(/\s*,\s*,/g, ',')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+-\s*$/, '')
    .replace(/-\s*,\s*/g, '- ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scheduleFromItem(item) {
  return {
    date: item.preferredDate || '',
    time: item.preferredTime || '',
    staff: item.staff || '',
  };
}

function normalizeSchedule(schedule = {}) {
  return {
    date: schedule.date || '',
    time: schedule.time || '',
    staff: schedule.staff || '',
  };
}

function visitScheduleKey(schedule = {}) {
  return [schedule.date || '', schedule.time || '', schedule.staff || ''].join('|');
}

function nextRecurringDate(dateValue, frequency, anchorDay) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  const months = recurrenceMonthOffset(frequency);
  if (months === 0) return addDays(dateValue, 7);
  const zeroMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroMonth / 12);
  const targetMonthIndex = ((zeroMonth % 12) + 12) % 12;
  const targetDay = Math.min(Number(anchorDay) || day, daysInMonth(targetYear, targetMonthIndex));
  return dateValueFromParts(targetYear, targetMonthIndex + 1, targetDay);
}

function recurrenceMonthOffset(frequency) {
  if (frequency === 'Quarterly') return 3;
  if (frequency === 'Half-year') return 6;
  if (frequency === 'Yearly') return 12;
  return frequency === 'Weekly' ? 0 : 1;
}

function addDays(dateValue, offset) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return dateValueFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function dayFromDate(dateValue) {
  return Number(String(dateValue || '').split('-')[2]) || null;
}

function dateValueFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function inferServiceType(item) {
  return inferRecurrenceFrequency(item) === 'One-time' ? 'One-time' : 'Recurring';
}

function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `charge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function stockOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}
