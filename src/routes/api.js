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

// Customers (Access: SUPER_ADMIN, ADMIN, & MARKETING)
router.get('/customers', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), customerController.getCustomers);
router.post('/customers', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), customerController.createCustomer);
router.put('/customers/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), customerController.updateCustomer);
router.delete('/customers/:id', authorizeRoles('SUPER_ADMIN'), customerController.deleteCustomer);

// Products & Stock (Access: SUPER_ADMIN & ADMIN can create/edit, MARKETING can view)
router.get('/products', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), stockController.getProducts);
router.post('/products', authorizeRoles('SUPER_ADMIN', 'ADMIN'), stockController.createProduct);
router.put('/products/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), stockController.updateProduct);
router.delete('/products/:id', authorizeRoles('SUPER_ADMIN'), stockController.deleteProduct);

// Pembelian / Barang Masuk (Access: SUPER_ADMIN & ADMIN)
router.post('/stock/incoming', authorizeRoles('SUPER_ADMIN', 'ADMIN'), stockController.recordIncomingGoods);

// Kartu Stok (Audit adjustment: SUPER_ADMIN only, Read ledger: SUPER_ADMIN, ADMIN, MARKETING)
router.post('/stock/adjustment', authorizeRoles('SUPER_ADMIN'), stockController.recordStockAdjustment);
router.get('/stock/ledger', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), stockController.getStockLedger);
router.put('/stock/ledger/:id/notes', authorizeRoles('SUPER_ADMIN'), stockController.updateStockLedgerNotes);
router.delete('/stock/ledger/:id', authorizeRoles('SUPER_ADMIN'), stockController.deleteStockMovement);

// Sales Orders & Credit Check (Access: SUPER_ADMIN & MARKETING)
router.post('/orders', authorizeRoles('SUPER_ADMIN', 'MARKETING'), orderController.createOrder);
router.post('/orders/import-daily-sales', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), orderController.importDailySales);
router.delete('/orders/:order_id', authorizeRoles('SUPER_ADMIN'), orderController.deleteOrderById);

// Payments & Deposit Validation
router.post('/payments', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), paymentController.submitPayment);
router.get('/payments/pending', authorizeRoles('SUPER_ADMIN'), paymentController.getPendingPayments);
router.post('/payments/:payment_id/validate', authorizeRoles('SUPER_ADMIN'), paymentController.validatePayment);
router.post('/invoices/:invoice_id/validate', authorizeRoles('SUPER_ADMIN'), paymentController.validateInvoiceDirectly);
router.put('/invoices/:invoice_id/fields', authorizeRoles('SUPER_ADMIN', 'MARKETING'), paymentController.updateInvoiceFields);

// Reports & Financial Debts
router.get('/reports/daily-sales', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), reportController.getDailySales);
router.get('/reports/daily-deposits', authorizeRoles('SUPER_ADMIN', 'MARKETING'), reportController.getDailyDeposits);
router.get('/reports/monthly-recap', authorizeRoles('SUPER_ADMIN', 'MARKETING'), reportController.getMonthlyRecap);
router.get('/reports/outstanding-debts', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MARKETING'), reportController.getOutstandingDebts);
router.get('/reports/inventory-global', authorizeRoles('SUPER_ADMIN', 'MARKETING'), reportController.getGlobalInventoryReport);

// System Utility: Reset Riwayat Transaksi (Access: SUPER_ADMIN only)
router.post('/system/reset-transactions', authorizeRoles('SUPER_ADMIN'), async (req, res) => {
    const db = require('../config/db');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // 1. Kosongkan pembayaran, invoice, item pesanan, dan pesanan
        await client.query('DELETE FROM payments');
        await client.query('DELETE FROM invoices');
        await client.query('DELETE FROM order_items');
        await client.query('DELETE FROM orders');

        // 2. Kosongkan log mutasi kartu stok
        await client.query('DELETE FROM stock_movements');

        // 3. Reset stok produk ke 0 agar bersih (opsional) atau biarkan stok awal
        if (req.body && req.body.reset_stock_to_zero) {
            await client.query('UPDATE products SET current_stock = 0');
        }

        await client.query('COMMIT');
        return res.json({ 
            message: 'Seluruh riwayat transaksi nota penjualan, pembayaran, invoice, dan mutasi stok berhasil dibersihkan!' 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;

