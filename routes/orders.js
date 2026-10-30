const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus
} = require('../controllers/orderController');
const { requireAdmin } = require('../middleware/auth');

// Public routes (reading an order back needs its access token, or an admin login)
router.post('/', createOrder);
router.get('/:id', getOrder);

// Admin routes
router.get('/', requireAdmin, getOrders);
router.put('/:id/status', requireAdmin, updateOrderStatus);

module.exports = router;