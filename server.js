const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { isAdmin } = require('./middleware/auth');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Behind Vercel's proxy: without this every visitor shares one rate-limit bucket.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// ✅ Allow CORS from all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: isAdmin // a logged-in admin is never throttled
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression middleware
app.use(compression());

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/carts', require('./routes/carts'));
app.use('/api/admin', require('./routes/admin'));

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Hudamoji is running!',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

console.log('Running');

// ✅ Export app for Vercel (no app.listen)
module.exports = app;
