import { createHandler } from '@/lib/apiAdapter';
const paymentController = require('@/controllers/paymentController');

export const POST = createHandler(paymentController.submitPayment, {
  roles: ['SUPER_ADMIN', 'ADMIN', 'MARKETING'],
});

