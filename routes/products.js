const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');
const { requireAdmin } = require('../middleware/auth');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories
} = require('../controllers/productController');

// Public routes
router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/:id', getProduct);

// Admin routes
router.post('/', requireAdmin, upload.array('images', 6), createProduct);
router.put('/:id', requireAdmin, upload.array('images', 6), updateProduct);
router.delete('/:id', requireAdmin, deleteProduct);

module.exports = router;