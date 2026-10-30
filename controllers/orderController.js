const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { isAdmin } = require('../middleware/auth');
const { normalizePhone, escapeRegex, cleanShade } = require('../utils/helpers');

// Keep in step with the totals shown on the storefront cart/checkout pages.
const SHIPPING_FEE = 250;
const TAX_RATE = 0.02;
const round2 = (n) => Math.round(n * 100) / 100;

const sameToken = (a = '', b = '') => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// +1 puts stock back (order cancelled), -1 takes it again (cancel undone). Never goes below zero.
const adjustStock = (items, sign) => Promise.all(items.map(i => sign > 0
  ? Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })
  : Product.updateOne({ _id: i.product, stock: { $gte: i.quantity } }, { $inc: { stock: -i.quantity } })
));

// @desc    Create new order
// @route   POST /api/orders
// @access  Public
const createOrder = async (req, res, next) => {
  try {
    const {
      customerInfo,
      shippingAddress,
      items,
      paymentMethod = 'cod',
      notes
    } = req.body;

    // Validate required fields
    if (!customerInfo || !customerInfo.firstName || !customerInfo.lastName || !customerInfo.phone) {
      return res.status(400).json({
        success: false,
        error: 'Customer information is incomplete'
      });
    }

    if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
      return res.status(400).json({
        success: false,
        error: 'Shipping address is incomplete'
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Order must contain at least one item'
      });
    }

    // Only the product id and quantity are taken from the browser.
    const wanted = new Map(); // product id -> quantity across all shades
    for (const item of items) {
      const qty = Number(item?.quantity);
      if (!mongoose.isValidObjectId(item?.product) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({ success: false, error: 'Invalid item in order' });
      }
      wanted.set(String(item.product), (wanted.get(String(item.product)) || 0) + qty);
    }

    const products = await Product.find({ _id: { $in: [...wanted.keys()] } });
    const byId = new Map(products.map(p => [String(p._id), p]));
    for (const [id, qty] of wanted) {
      const product = byId.get(id);
      if (!product || product.status === 'inactive') {
        return res.status(400).json({
          success: false,
          error: `${product ? product.name : 'A product in your order'} is no longer available`
        });
      }
      if (product.stock < qty) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}`
        });
      }
    }

    // Name, price, image and every total are rebuilt from the DB; whatever the browser sent is ignored.
    const orderItems = items.map(item => {
      const product = byId.get(String(item.product));
      const shade = cleanShade(item.selectedShade);
      return {
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: Number(item.quantity),
        image: product.images[0]?.url || '',
        ...(shade && { selectedShade: shade })
      };
    });
    const subtotal = round2(orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0));
    const tax = round2(subtotal * TAX_RATE);

    const order = await Order.create({
      customerInfo,
      shippingAddress,
      items: orderItems,
      subtotal,
      shipping: SHIPPING_FEE,
      tax,
      total: round2(subtotal + SHIPPING_FEE + tax),
      paymentMethod,
      notes
    });

    // Update product stock
    for (const [id, qty] of wanted) {
      await Product.updateOne({ _id: id }, { $inc: { stock: -qty } });
    }

    // They bought, so their saved cart is no longer abandoned.
    Cart.updateOne({ phone: normalizePhone(customerInfo.phone) }, { status: 'recovered' })
      .catch(err => console.error('Error closing cart:', err));


    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    let query = {};
    if (status) {
      query.status = status;
    }
    if (search && search.trim()) {
      const re = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { orderNumber: re },
        { 'customerInfo.firstName': re },
        { 'customerInfo.lastName': re },
        { 'customerInfo.phone': re }
      ];
      // "0300 1234567", "+92-300-1234567" and "3001234567" all find the same customer.
      const national = search.replace(/\D/g, '').replace(/^(?:00)?92/, '').replace(/^0/, '');
      if (national.length >= 6) {
        query.$or.push({ 'customerInfo.phone': new RegExp(national.split('').join('\\D*')) });
      }
    }

    const [orders, total, countRows] = await Promise.all([
      Order.find(query)
        .populate('items.product', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit),
      Order.countDocuments(query),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
    ]);

    res.json({
      success: true,
      data: orders,
      counts: Object.fromEntries(countRows.map(r => [r._id, r.n])),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id?token=...
// @access  Admin, or the shopper holding the order's access token
const getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('+accessToken')
      .populate('items.product', 'name images');

    // Ids are guessable, so a wrong token looks exactly like a missing order.
    if (!order || (!isAdmin(req) && !sameToken(order.accessToken, req.query.token))) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const data = order.toJSON();
    delete data.accessToken;
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, paymentStatus } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (paymentStatus !== undefined) update.paymentStatus = paymentStatus;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const before = await Order.findById(req.params.id);
    if (!before) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });

    if (status === 'cancelled' && before.status !== 'cancelled') {
      await adjustStock(before.items, 1);
    } else if (before.status === 'cancelled' && status && status !== 'cancelled') {
      await adjustStock(before.items, -1);
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus
};