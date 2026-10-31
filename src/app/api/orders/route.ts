import { createHandler } from '@/lib/apiAdapter';
const orderController = require('@/controllers/orderController');

export const POST = createHandler(orderController.createOrder, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

