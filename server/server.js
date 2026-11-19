require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { sanitizeInputs } = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const slotClient = require('./services/slotClient');
const runSeed = require('./seed/seed');

// Route imports
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const addressRoutes = require('./routes/addressRoutes');
const slotRoutes = require('./routes/slotRoutes');
const orderRoutes = require('./routes/orderRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === 'production';

// Trust Railway / reverse proxy headers for secure cookies & rate limiting
app.set('trust proxy', 1);

// Security headers (allow Unsplash external product images and Chart.js canvas)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// Strict CORS configuration
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (e.g. server-rendered SPA, health checks, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request logging, body & cookie parsing, NoSQL sanitization
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(sanitizeInputs);

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down and try again.' },
});
app.use('/api', apiLimiter);

// Health check endpoint (checks MongoDB + Python slot-service)
app.get('/health', async (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const slotHealth = await slotClient.checkHealth();
  const statusCode = dbReady ? 200 : 503;

  return res.status(statusCode).json({
    status: dbReady ? 'ok' : 'degraded',
    service: 'slotkart-server',
    database: dbReady ? 'connected' : 'disconnected',
    slotService: slotHealth.reachable ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/delivery', deliveryRoutes);

// Production static serving of built React app (checks server/public then ../client/dist)
const staticCandidates = [
  path.resolve(__dirname, 'public'),
  path.resolve(__dirname, '../client/dist'),
];
const clientBuildDir = staticCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

if (isProd && clientBuildDir) {
  app.use(express.static(clientBuildDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    return res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
}

// 404 & centralized error handler (never exposes stack traces)
app.use(notFound);
app.use(errorHandler);

// Start server after DB connection + idempotent auto-seed
const startServer = async () => {
  try {
    await connectDB();
    await runSeed({ onlyIfEmpty: true });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] SlotKart API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
      console.log(`[Server] Slot Engine target: ${process.env.SLOT_SERVICE_URL || 'http://localhost:8000'}`);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err.message);
    process.exit(1);
  }
};

startServer();
