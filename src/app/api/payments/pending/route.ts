import { createHandler } from '@/lib/apiAdapter';
const paymentController = require('@/controllers/paymentController');

export const GET = createHandler(paymentController.getPendingPayments, {
  roles: ['SUPER_ADMIN'],
});

