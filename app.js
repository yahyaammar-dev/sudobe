require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Original API routes (for mobile app compatibility)
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/catalogue', require('./routes/catalogueRoutes'));
app.use('/api/checkout', require('./routes/checkoutRoutes'));
app.use('/api/account', require('./routes/accountsRoutes'));
app.use('/api/contact', require('./routes/contact'));
app.use('/webhook', require('./routes/webhookRoutes'));

// New content management routes
app.use('/api/content', require('./routes/bannerRoutes'));
app.use('/api/content', require('./routes/imageRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Default route
app.get('/', (req, res) => {
  res.send('API is running...');
});

module.exports = app;
