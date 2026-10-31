import { createHandler } from '@/lib/apiAdapter';
const orderController = require('@/controllers/orderController');

export const DELETE = createHandler(orderController.deleteOrderById, {
  roles: ['SUPER_ADMIN'],
});

