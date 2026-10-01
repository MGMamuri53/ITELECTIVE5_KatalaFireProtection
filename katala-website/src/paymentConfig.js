export const qrPhPaymentConfig = {
  qrImageSrc: '/QRpayment.jpg',
  recipientName: 'Katala Fire Protection Product Trading',
  recipientAccount: '',
  note: 'Static QR details must be verified before payment. The order amount and reference are shown separately in checkout.',
}

export const ewalletPaymentConfig = {
  accountName: import.meta.env.VITE_GCASH_ACCOUNT_NAME || '',
  accountNumber: import.meta.env.VITE_GCASH_ACCOUNT_NUMBER || '',
}

export const bankPaymentConfig = {
  bankName: import.meta.env.VITE_BANK_NAME || '',
  accountName: import.meta.env.VITE_BANK_ACCOUNT_NAME || '',
  accountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || '',
}
