export const queue = [
  { id: 'QT-24018', customer: 'Apex Industrial Park', kind: 'Quote', subject: 'Fire alarm control panel and smoke detectors', status: 'Needs review', priority: 'High' },
  { id: 'SR-24011', customer: 'Summit Healthcare Facility', kind: 'Service', subject: 'Preventive maintenance schedule request', status: 'Awaiting schedule', priority: 'Normal' },
  { id: 'QT-24016', customer: 'Nexus Tech Campus', kind: 'Quote', subject: 'Firehose cabinet replenishment', status: 'Draft quote', priority: 'Normal' },
  { id: 'SR-24008', customer: 'Harbor Logistics', kind: 'Service', subject: 'Fire pump inspection', status: 'Customer reply', priority: 'High' },
];

export const threads = [
  { id: 'MSG-01', customer: 'Apex Industrial Park', request: 'QT-24018', lastMessage: 'We also need installation availability next week.', unread: 2, time: '10:42 AM' },
  { id: 'MSG-02', customer: 'Harbor Logistics', request: 'SR-24008', lastMessage: 'Can your team inspect the pump room this Friday?', unread: 1, time: '9:18 AM' },
  { id: 'MSG-03', customer: 'Nexus Tech Campus', request: 'QT-24016', lastMessage: 'Please send the updated quotation when ready.', unread: 0, time: 'Yesterday' },
];

export const chatMessages = [
  { from: 'customer', name: 'Apex Industrial Park', text: 'Can you confirm if the quoted panel supports our existing alarm zones?' },
  { from: 'staff', name: 'Katala Staff', text: 'Yes, we are checking the model compatibility. I will attach the notes to your quotation.' },
  { from: 'customer', name: 'Apex Industrial Park', text: 'Thank you. We also need installation availability next week.' },
];

export const calendarItems = [
  { date: 'Aug 26', time: '9:00 AM', customer: 'Summit Healthcare Facility', service: 'Preventive Maintenance', staff: 'Mara Santos', status: 'Confirmed' },
  { date: 'Aug 27', time: '1:30 PM', customer: 'Harbor Logistics', service: 'Fire Pump Inspection', staff: 'Luis Reyes', status: 'For confirmation' },
  { date: 'Aug 29', time: '10:00 AM', customer: 'Apex Industrial Park', service: 'Alarm Panel Site Check', staff: 'Mara Santos', status: 'Tentative' },
];

export const maintenanceChecks = [
  { id: 'PM-1007', customer: 'Summit Healthcare Facility', scope: 'Monthly alarm and detector checkup', due: 'Aug 26, 2026', frequency: 'Monthly', status: 'Due soon' },
  { id: 'PM-1008', customer: 'Cavite Learning Center', scope: 'Quarterly fire extinguisher inspection', due: 'Sep 2, 2026', frequency: 'Quarterly', status: 'Scheduled' },
  { id: 'PM-1010', customer: 'Harbor Logistics', scope: 'Fire pump preventive maintenance', due: 'Sep 9, 2026', frequency: 'Monthly', status: 'Open' },
];

export const completedItems = [
  { id: 'QT-24002', customer: 'Dasmarinas Office Plaza', type: 'Quote', completed: 'Aug 18, 2026', result: 'Quotation sent' },
  { id: 'SR-23994', customer: 'Westgate Warehouse', type: 'Service', completed: 'Aug 17, 2026', result: 'Service report uploaded' },
  { id: 'PM-0988', customer: 'Summit Healthcare Facility', type: 'Maintenance', completed: 'Aug 14, 2026', result: 'Passed inspection' },
];
