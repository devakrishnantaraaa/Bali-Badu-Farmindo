const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const customerController = require('../controllers/customerController');
const stockController = require('../controllers/stockController');
const orderController = require('../controllers/orderController');
const paymentController = require('../controllers/paymentController');
const reportController = require('../controllers/reportController');

const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Public Auth Routes
router.post('/auth/register', authController.registerUser);
router.post('/auth/login', authController.loginUser);

// All protected routes below require valid JWT token
router.use(authenticateToken);

// Customers (Access: SUPER_ADMIN & MARKETING)
router.get('/customers', authorizeRoles('SUPER_ADMIN', 'MARKETING'), customerController.getCustomers);
router.post('/customers', authorizeRoles('SUPER_ADMIN', 'MARKETING'), customerController.createCustomer);

// Products & Stock (Access: SUPER_ADMIN can input stock, MARKETING can view products)
router.get('/products', authorizeRoles('SUPER_ADMIN', 'MARKETING'), stockController.getProducts);
router.post('/stock/incoming', authorizeRoles('SUPER_ADMIN'), stockController.recordIncomingGoods);
router.get('/stock/ledger', authorizeRoles('SUPER_ADMIN', 'MARKETING'), stockController.getStockLedger);

// Sales Orders & Credit Check (Access: SUPER_ADMIN & MARKETING)
router.post('/orders', authorizeRoles('SUPER_ADMIN', 'MARKETING'), orderController.createOrder);

// Payments & Deposit Validation
// Marketing can submit setoran payment
router.post('/payments', authorizeRoles('SUPER_ADMIN', 'MARKETING'), paymentController.submitPayment);
// ONLY SUPER_ADMIN can view pending payments and validate/unblock invoices!
router.get('/payments/pending', authorizeRoles('SUPER_ADMIN'), paymentController.getPendingPayments);
router.post('/payments/:payment_id/validate', authorizeRoles('SUPER_ADMIN'), paymentController.validatePayment);

// Reports & Financial Debts (Access: SUPER_ADMIN & MARKETING)
router.get('/reports/daily-sales', authorizeRoles('SUPER_ADMIN', 'MARKETING'), reportController.getDailySales);
router.get('/reports/monthly-recap', authorizeRoles('SUPER_ADMIN'), reportController.getMonthlyRecap);
router.get('/reports/outstanding-debts', authorizeRoles('SUPER_ADMIN', 'MARKETING'), reportController.getOutstandingDebts);

module.exports = router;
