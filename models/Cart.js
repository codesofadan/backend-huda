const mongoose = require('mongoose');

// One row per phone number (or per browser, until the visitor types a number): their latest cart.
const cartSchema = new mongoose.Schema({
  phone: { type: String, unique: true, sparse: true }, // missing = anonymous, can't be messaged
  cid: { type: String, index: true }, // random id of the visitor's browser
  name: { type: String, trim: true, default: '' },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: { type: Number, min: 1 },
    image: String,
    selectedShade: { name: String, code: String }
  }],
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'recovered'], default: 'open' },
  contactedAt: Date
}, { timestamps: true });

// Carts nobody touched for 30 days vanish on their own.
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Cart', cartSchema);
