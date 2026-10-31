import { createHandler } from '@/lib/apiAdapter';
const orderController = require('@/controllers/orderController');

export const POST = createHandler(orderController.importDailySales, {
  roles: ['SUPER_ADMIN', 'ADMIN', 'MARKETING'],
});

