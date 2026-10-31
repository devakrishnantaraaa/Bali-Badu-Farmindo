import { createHandler } from '@/lib/apiAdapter';
const reportController = require('@/controllers/reportController');

export const GET = createHandler(reportController.getGlobalInventoryReport, {
  roles: ['SUPER_ADMIN', 'MARKETING'],
});

