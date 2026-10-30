const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { normalizePhone, cleanShade } = require('../utils/helpers');

const CID = /^[\w-]{16,64}$/;

// @desc    Remember a visitor's cart. Keyed by phone once they typed one, else by a random browser id.
// @route   POST /api/carts
// @access  Public
const saveCart = async (req, res, next) => {
  try {
    const cid = CID.test(String(req.body.cid || '')) ? req.body.cid : '';
    const phone = req.body.phone ? normalizePhone(req.body.phone) : '';
    if ((phone && (phone.length < 10 || phone.length > 15)) || (!phone && !cid)) {
      return res.status(400).json({ success: false, error: 'Valid phone number required' });
    }

    const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 20) : [];
    const ids = raw.map(i => i?.product).filter(id => mongoose.isValidObjectId(id));
    const products = await Product.find({ _id: { $in: ids }, status: 'active' }).select('name price images');
    const byId = new Map(products.map(p => [String(p._id), p]));

    // Name, price and image come from the DB, never from the client.
    const items = raw.flatMap(i => {
      const p = byId.get(String(i?.product));
      if (!p) return [];
      const item = {
        product: p._id,
        name: p.name,
        price: p.price,
        quantity: Math.min(Math.max(parseInt(i.quantity) || 1, 1), 99),
        image: p.images[0]?.url || ''
      };
      const shade = cleanShade(i.selectedShade);
      if (shade) item.selectedShade = shade;
      return [item];
    });

    if (items.length === 0) {
      // Shopper emptied the cart (or ordered): forget what we kept for this browser.
      if (!cid) return res.status(400).json({ success: false, error: 'Cart is empty' });
      await Cart.deleteMany({ cid });
      return res.json({ success: true });
    }

    const update = { items, total: items.reduce((sum, i) => sum + i.price * i.quantity, 0), status: 'open' };
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (name) update.name = name;

    const opts = { upsert: true, setDefaultsOnInsert: true };
    if (phone) {
      // A number was typed: this browser's anonymous cart becomes one we can message about.
      if (cid) {
        update.cid = cid;
        await Cart.deleteOne({ cid, phone: { $exists: false } });
      }
      await Cart.findOneAndUpdate({ phone }, update, opts);
    } else {
      await Cart.findOneAndUpdate({ cid, phone: { $exists: false } }, update, opts);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { saveCart };
