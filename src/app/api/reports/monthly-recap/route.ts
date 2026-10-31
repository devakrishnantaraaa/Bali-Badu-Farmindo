import { createHandler } from '@/lib/apiAdapter';
const reportController = require('@/controllers/reportController');

export const GET = createHandler(reportController.getMonthlyRecap, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

