import { createHandler } from '@/lib/apiAdapter';
const paymentController = require('@/controllers/paymentController');

export const POST = createHandler(paymentController.bulkUpdateDeposits, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

