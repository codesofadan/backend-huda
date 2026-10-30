const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { normalizePhone } = require('../utils/helpers');

const TZ = 'Asia/Karachi';
const DAY = 24 * 60 * 60 * 1000;
const LOW_STOCK = 5;
// A cart counts as abandoned once the visitor has been idle this long.
const ABANDON_AFTER = 30 * 60 * 1000;

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const abandonedFilter = () => ({ status: 'open', updatedAt: { $lt: new Date(Date.now() - ABANDON_AFTER) } });

// @desc    Dashboard numbers
// @route   GET /api/admin/stats
const getStats = async (req, res, next) => {
  try {
    const now = Date.now();
    const notCancelled = { status: { $ne: 'cancelled' } };

    const [daily, statusRows, lifetimeRows, recent, lowStock, productCount, top, phones, carts] = await Promise.all([
      Order.aggregate([
        { $match: { ...notCancelled, createdAt: { $gte: new Date(now - 31 * DAY) } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' }
        } }
      ]),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: notCancelled },
        { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }
      ]),
      Order.find().sort({ createdAt: -1 }).limit(6)
        .select('orderNumber customerInfo total status paymentStatus createdAt').lean(),
      Product.find({ status: { $ne: 'inactive' }, stock: { $lte: LOW_STOCK } })
        .sort({ stock: 1 }).limit(8).select('name stock images').lean(),
      Product.countDocuments(),
      Order.aggregate([
        { $match: { ...notCancelled, createdAt: { $gte: new Date(now - 30 * DAY) } } },
        { $unwind: '$items' },
        { $group: {
          _id: '$items.product',
          name: { $last: '$items.name' },
          image: { $last: '$items.image' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        } },
        { $sort: { quantity: -1 } },
        { $limit: 5 }
      ]),
      Order.distinct('customerInfo.phone'),
      Cart.aggregate([
        { $match: abandonedFilter() },
        { $group: {
          _id: { $cond: [{ $ifNull: ['$phone', false] }, 'phone', 'anon'] },
          count: { $sum: 1 },
          value: { $sum: '$total' }
        } }
      ])
    ]);
    const cartStat = (key) => {
      const r = carts.find(c => c._id === key);
      return { count: r?.count || 0, value: r?.value || 0 };
    };

    const byDay = new Map(daily.map(d => [d._id, d]));
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = dayKey(now - (29 - i) * DAY);
      const d = byDay.get(date);
      return { date, orders: d?.orders || 0, revenue: d?.revenue || 0 };
    });
    const sum = (rows) => rows.reduce((a, d) => ({ orders: a.orders + d.orders, revenue: a.revenue + d.revenue }), { orders: 0, revenue: 0 });

    const statusCounts = Object.fromEntries(statusRows.map(r => [r._id, r.n]));
    const lifetime = lifetimeRows[0] || { orders: 0, revenue: 0 };

    res.json({
      success: true,
      data: {
        today: days[29],
        week: sum(days.slice(23)),
        month: sum(days),
        lifetime: { orders: lifetime.orders, revenue: lifetime.revenue },
        days,
        statusCounts,
        pendingOrders: statusCounts.pending || 0,
        recentOrders: recent,
        lowStock,
        lowStockLimit: LOW_STOCK,
        productCount,
        topProducts: top,
        customerCount: new Set(phones.map(normalizePhone)).size,
        abandonedCarts: cartStat('phone'),
        anonymousCarts: cartStat('anon')
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Customers, built from order history (the store has no accounts)
// @route   GET /api/admin/customers
// shortcut: grouped in memory, move to an aggregation with a stored normalized phone past ~20k orders
const getCustomers = async (req, res, next) => {
  try {
    const { search = '', sort = 'recent' } = req.query;
    const orders = await Order.find()
      .select('customerInfo shippingAddress total status createdAt')
      .sort({ createdAt: -1 }).lean();

    const map = new Map();
    for (const o of orders) { // newest first, so the first hit holds the latest name/city
      const key = normalizePhone(o.customerInfo?.phone);
      let c = map.get(key);
      if (!c) {
        c = {
          phone: key,
          name: `${o.customerInfo?.firstName || ''} ${o.customerInfo?.lastName || ''}`.trim(),
          city: o.shippingAddress?.city || '',
          orders: 0,
          spent: 0,
          lastOrderAt: o.createdAt
        };
        map.set(key, c);
      }
      c.orders += 1;
      if (o.status !== 'cancelled') c.spent += o.total;
      c.firstOrderAt = o.createdAt;
    }

    let customers = [...map.values()];
    const summary = {
      total: customers.length,
      repeat: customers.filter(c => c.orders > 1).length
    };

    const q = search.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, '');
      customers = customers.filter(c => c.name.toLowerCase().includes(q) || (digits && c.phone.includes(digits)));
    }
    if (sort === 'spent') customers.sort((a, b) => b.spent - a.spent);
    else if (sort === 'orders') customers.sort((a, b) => b.orders - a.orders);
    else customers.sort((a, b) => b.lastOrderAt - a.lastOrderAt);

    res.json({ success: true, data: customers.slice(0, 500), summary });
  } catch (error) {
    next(error);
  }
};

// @desc    Carts left behind: `data` has a phone number (can be messaged), `anonymous` does not
// @route   GET /api/admin/carts
const getCarts = async (req, res, next) => {
  try {
    const find = (phone) => Cart.find({ ...abandonedFilter(), phone }).sort({ updatedAt: -1 }).limit(200).lean();
    const [carts, anonymous] = await Promise.all([find({ $exists: true }), find({ $exists: false })]);
    res.json({ success: true, data: carts, anonymous });
  } catch (error) {
    next(error);
  }
};

// @route   PATCH /api/admin/carts/:id/contacted
const markCartContacted = async (req, res, next) => {
  try {
    const cart = await Cart.findByIdAndUpdate(req.params.id, { contactedAt: new Date() }, { new: true });
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

// @route   DELETE /api/admin/carts/:id
const deleteCart = async (req, res, next) => {
  try {
    const cart = await Cart.findByIdAndDelete(req.params.id);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats, getCustomers, getCarts, markCartContacted, deleteCart };
