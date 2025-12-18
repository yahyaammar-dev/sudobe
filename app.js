require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' })); // Increase limit for PDF generation
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Original API routes (for mobile app compatibility)
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/catalogue', require('./routes/catalogueRoutes'));
app.use('/api/checkout', require('./routes/checkoutRoutes'));
app.use('/api/account', require('./routes/accountsRoutes'));
app.use('/api/contact', require('./routes/contact'));
app.use('/webhook', require('./routes/webhookRoutes'));

// Public API: Shipping rates (no authentication required)
app.get('/api/shipping-rates', require('./routes/shippingRatesRoutes').getPublicShippingRates);

// New content management routes
app.use('/api/content', require('./routes/bannerRoutes'));
app.use('/api/content', require('./routes/imageRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// QA Report routes
app.use('/api/qa', require('./routes/qaRoutes'));

// QC Report page route (protected)
const verifyToken = require('./middleware/auth');
app.get('/qa', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'qa.html'));
});

// Shipping rates page route (protected)
const serveShippingRatesPage = require('./routes/shippingRatesRoutes');
app.get('/shipping-rates', verifyToken, serveShippingRatesPage);

// Shipping rates API routes (protected)
app.use('/shipping-rates', verifyToken, require('./routes/shippingRatesRoutes').router);

// Customers page route (protected)
const serveCustomersPage = require('./routes/customersRoutes');
app.get('/customers', verifyToken, serveCustomersPage);

// Customers API routes (protected)
app.use('/customers', verifyToken, require('./routes/customersRoutes').router);

// Factories page route (protected)
const serveFactoriesPage = require('./routes/factoriesRoutes');
app.get('/factories', verifyToken, serveFactoriesPage);

// Factories API routes (protected)
app.use('/factories', verifyToken, require('./routes/factoriesRoutes').router);

// Orders page route (protected)
const serveOrdersPage = require('./routes/ordersRoutes');
app.get('/orders', verifyToken, serveOrdersPage);

// Orders API routes (protected)
app.use('/orders', verifyToken, require('./routes/ordersRoutes').router);

// Logs page route (protected, super admin only)
const serveLogsPage = require('./routes/logsRoutes');
app.get('/logs', verifyToken, serveLogsPage);

// Logs API routes (protected, super admin only)
app.use('/logs', verifyToken, require('./routes/logsRoutes').router);

// Permissions page route (protected, super admin only)
const servePermissionsPage = require('./routes/permissionsRoutes');
app.get('/permissions', verifyToken, servePermissionsPage);

// Permissions API routes (protected, super admin only)
app.use('/permissions', verifyToken, require('./routes/permissionsRoutes').router);

// Default route
app.get('/', (req, res) => {
  return res.redirect('/api/content/');
});

module.exports = app;
