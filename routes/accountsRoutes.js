const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accountsController');

router.get('/get-all-orders/:userId', accountsController.getOrdersByUserId)
router.get('/get-order/:orderId', accountsController.getOrderById)
router.delete('/delete-account/:accountId', accountsController.deleteAccount);
router.get('/:accountId/addresses', accountsController.getAddressesByAccountId);
router.put('/addresses/:addressId', accountsController.updateAddress);
router.delete('/addresses/:addressId', accountsController.deleteAddress);
router.post('/addresses', accountsController.createAddress);
router.post('/:accountId/favorites', accountsController.updateFavorites);
router.get('/:accountId/favorites', accountsController.getFavoriteProducts);



module.exports = router;