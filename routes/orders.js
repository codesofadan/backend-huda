const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus
} = require('../controllers/orderController');

// Public routes
router.post('/', createOrder);
router.get('/:id', getOrder);

// Admin routes (in production, add authentication middleware)
router.get('/', getOrders);
router.put('/:id/status', updateOrderStatus);

module.exports = router;