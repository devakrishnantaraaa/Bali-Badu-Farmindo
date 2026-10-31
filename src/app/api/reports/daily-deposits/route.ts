import { createHandler } from '@/lib/apiAdapter';
const reportController = require('@/controllers/reportController');

export const GET = createHandler(reportController.getDailyDeposits, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

