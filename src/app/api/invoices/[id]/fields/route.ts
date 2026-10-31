import { createHandler } from '@/lib/apiAdapter';
const paymentController = require('@/controllers/paymentController');

export const PUT = createHandler(paymentController.updateInvoiceFields, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

