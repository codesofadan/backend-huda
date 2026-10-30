const express = require('express');
const { saveCart } = require('../controllers/cartController');

const router = express.Router();

router.post('/', saveCart);

module.exports = router;
