const express = require('express');
const cors = require('cors'); // <--- Add this line
const userRoutes = require('./routes/userRoutes');
const catalogueRoutes = require('./routes/catalogueRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const accountsController = require('./routes/accountsRoutes');
const contactRoutes = require('./routes/contact');
const webhookRoutes = require('./routes/webhookRoutes');
const bannerRoutes = require('./routes/bannerRoutes');

const app = express();

app.use(cors()); 

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.use('/api/users', userRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/account', accountsController);
app.use('/api/contact', contactRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api/content', bannerRoutes);

app.get('/', async (req, res) => {
  console.log("why are you hitting /")
  res.send('API is running...');
});

module.exports = app;
