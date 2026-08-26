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
  const quantity = numberOrDefault(charge.quantity, 1);
  const unitPrice = money(charge.unitPrice);
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
    subtotal: money(quantity * unitPrice),
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
