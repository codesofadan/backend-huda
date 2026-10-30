const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, requireAdmin } = require('../middleware/auth');
const { getProducts } = require('../controllers/productController');
const {
  getStats,
  getCustomers,
  getCarts,
  markCartContacted,
  deleteCart
} = require('../controllers/adminController');

const router = express.Router();

// shortcut: in-memory counter, per serverless instance. Use a shared store if brute force becomes real.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' }
});

router.post('/login', loginLimiter, login);

router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ success: true }));
router.get('/stats', getStats);
router.get('/customers', getCustomers);
router.get('/carts', getCarts);
router.patch('/carts/:id/contacted', markCartContacted);
router.delete('/carts/:id', deleteCart);

// Same list as the store, but includes hidden / out-of-stock products.
router.get('/products', (req, res, next) => {
  req.adminList = true;
  getProducts(req, res, next);
});

module.exports = router;
