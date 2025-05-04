const express = require('express');
const userRoutes = require('./routes/userRoutes');
const catalogueRoutes = require('./routes/catalogueRoutes');

const app = express();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/catalogue', catalogueRoutes);

app.get('/', async (req, res) => {
  res.send('API is running...');

  

});

module.exports = app;
