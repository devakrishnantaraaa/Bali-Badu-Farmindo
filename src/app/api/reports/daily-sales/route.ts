import { createHandler } from '@/lib/apiAdapter';
const reportController = require('@/controllers/reportController');

export const GET = createHandler(reportController.getDailySales, {
  roles: ['SUPER_ADMIN', 'ADMIN', 'MARKETING'],
});

