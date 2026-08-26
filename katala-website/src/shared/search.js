export function normalizeSearch(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchesSearch(record, query, fields = defaultFields) {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return flattenSearchValues(record, fields).some((value) =>
    normalizeSearch(value).includes(needle)
  );
}

export function filterBySearch(records, query, fields = defaultFields) {
  const needle = normalizeSearch(query);
  if (!needle) return records;
  return records.filter((record) => matchesSearch(record, needle, fields));
}

const defaultFields = [
  'id',
  'referenceNumber',
  'accountId',
  'customer',
  'customerName',
  'name',
  'email',
  'serviceName',
  'productName',
  'subject',
  'projectName',
  'establishmentName',
  'projectAddress',
  'address',
  'staff',
  'assignedStaff',
  'status',
  'schedule.date',
  'schedule.time',
  'preferredDate',
  'preferredTime',
  'submittedAt',
  'updatedAt',
];

function flattenSearchValues(record, fields) {
  const values = [];
  for (const field of fields) {
    const value = getPath(record, field);
    if (Array.isArray(value)) {
      values.push(...value.flatMap((item) => flattenRecord(item)));
    } else if (value && typeof value === 'object') {
      values.push(...flattenRecord(value));
    } else if (value !== undefined && value !== null) {
      values.push(value);
    }
  }
  return values;
}

function flattenRecord(value) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenRecord(item));
  if (!value || typeof value !== 'object') return [value];
  return Object.values(value).flatMap((item) => flattenRecord(item));
}

function getPath(record, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], record);
}
