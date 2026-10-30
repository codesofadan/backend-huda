const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const tokenFrom = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// Boolean check, never responds. Also used by the rate limiter to exempt the admin.
const isAdmin = (req) => {
  const token = tokenFrom(req);
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).role === 'admin';
  } catch {
    return false;
  }
};

const requireAdmin = (req, res, next) => {
  if (isAdmin(req)) return next();
  res.status(401).json({ success: false, error: 'Admin login required' });
};

// Hash both sides so timingSafeEqual gets equal-length buffers.
const sameSecret = (a, b) => {
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

const login = (req, res) => {
  const { ADMIN_PASSWORD, JWT_SECRET } = process.env;
  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(503).json({ success: false, error: 'Admin login is not configured on the server' });
  }
  if (!sameSecret(req.body?.password ?? '', ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ success: true, token });
};

module.exports = { isAdmin, requireAdmin, login };
