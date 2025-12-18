const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { paths } = require('./utils/moduleResolver');
const { requireAdmin } = require('./middleware/authenticate');

// Import logging system
const { apiLogger } = require('./utils/logger');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const pipelineRoutes = require('./routes/pipeline');
const resultsRoutes = require('./routes/results');
const taxonSearch = require('./routes/taxon');
const seqSearch = require('./routes/sequenceSearch');
const geosearchRoutes = require('./routes/geosearch');
const tableRoutes = require('./routes/table');

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true, limit: '2gb' }));
app.use(express.json({ limit: '2gb' }));
app.use(cookieParser());

const isProduction = process.env.NODE_ENV === 'production';
const defaultAllowedOrigin = process.env.FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || 8080}`;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (!allowedOrigins.length && defaultAllowedOrigin) {
  allowedOrigins.push(defaultAllowedOrigin);
}

// CORS with allowlist and credential support
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !origin || allowedOrigins.includes(origin);

  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (isAllowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  if (!isAllowed) {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(403);
    }
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  return next();
});

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "connect-src 'self'",
  "frame-ancestors 'self'"
].join('; ');

// Security headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// Add logging middleware
app.use(apiLogger.httpMiddleware());

// Make logger available in requests
app.use((req, res, next) => {
  req.logger = apiLogger;
  next();
});

// ROUTES
app.use('/auth', authRoutes);
app.use('/upload', uploadRoutes);
app.use('/pipeline', pipelineRoutes);
app.use('/results', resultsRoutes);
app.use('/taxon_search', taxonSearch);
app.use('/sequence_search', seqSearch);
app.use('/api/geosearch', geosearchRoutes);
app.use('/api/table', tableRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const pool = require(paths.db());
    await pool.query('SELECT 1');
    
    // Test Redis connection
    const { connection } = require('./queues');
    await connection.ping();
    
    apiLogger.info('Health check passed', {
      services: { database: 'connected', redis: 'connected' }
    });
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    apiLogger.error('Health check failed', { 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      error: isProduction ? 'Service unavailable' : error.message 
    });
  }
});

// JOINS - Fix the path to HTML files (they're in the parent src directory, not a subdirectory)
const htmlPath = path.join(__dirname, '..', '..', 'src', 'html');

app.get('/header', (req, res) => res.sendFile(path.join(htmlPath, 'header.html')));
app.get('/left_menu', (req, res) => res.sendFile(path.join(htmlPath, 'left_menu.html')));

app.get('/', (req, res) => res.sendFile(path.join(htmlPath, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(htmlPath, 'login.html')));
app.get('/register', requireAdmin, (req, res) => res.sendFile(path.join(htmlPath, 'register.html')));
app.get('/taxon', (req, res) => res.sendFile(path.join(htmlPath, 'taxon_search.html')));
app.get('/sequence', (req, res) => res.sendFile(path.join(htmlPath, 'sequence_search.html')));
app.get('/geosearch', (req, res) => res.sendFile(path.join(htmlPath, 'geosearch.html')));
app.get('/pipeline-status', (req, res) => res.sendFile(path.join(htmlPath, 'pipeline_status.html')));

app.get('/upload', (req, res) => res.sendFile(path.join(htmlPath, 'upload.html')));

app.get('/help', (req, res) => res.sendFile(path.join(htmlPath, 'help.html')));
app.get('/about', (req, res) => res.sendFile(path.join(htmlPath, 'about.html')));
app.get('/collaborators', (req, res) => res.sendFile(path.join(htmlPath, 'collaborators.html')));

// STATIC - Fix the path to static files
app.use('/static', express.static(path.join(__dirname, '..', '..', 'src', 'static')));

// 404 handler for API routes - Removed the /upload/* handler to allow download endpoints
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  apiLogger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  const status = err.status || 500;
  const safeMessage = isProduction ? 'Internal server error' : (err.message || 'Internal server error');

  res.status(status).json({ 
    error: safeMessage,
    ...(!isProduction && { stack: err.stack })
  });
});

// Start server when run directly and expose a health endpoint
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.get('/_health', (req, res) => res.json({ ok: true, pid: process.pid }));

// Start the server (removed the require.main check since we're being required by startup.js)
app.listen(PORT, HOST, () => {
  apiLogger.info('Server started', {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  });
  console.log(`Server listening on ${HOST}:${PORT}`);
});

module.exports = app;
