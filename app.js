const express = require('express');
const userRoutes = require('./routes/userRoutes');
const catalogueRoutes = require('./routes/catalogueRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const accountsController = require('./routes/accountsRoutes')
const contactRoutes = require('./routes/contact');
// const notificationRoutes = require('./routes/notificationRoutes');



const app = express();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/account', accountsController);
app.use('/api/contact', contactRoutes);
// app.use('/api/notifications', notificationRoutes);



app.get('/', async (req, res) => {
  res.send('API is running...');
});

module.exports = app;