const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

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
app.use(express.urlencoded({ extended: true, limit: '2gb' }));
app.use(express.json({ limit: '2gb' }));
app.use(cookieParser());

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
    const pool = require('/app/db/db');
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
      error: error.message 
    });
  }
});

// JOINS - Fix the path to HTML files (they're in the parent src directory, not a subdirectory)
const htmlPath = path.join(__dirname, '..', '..', 'src', 'html');

app.get('/', (req, res) => res.sendFile(path.join(htmlPath, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(htmlPath, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(htmlPath, 'register.html')));
app.get('/geosearch', (req, res) => res.sendFile(path.join(htmlPath, 'geosearch.html')));
//app.get('/sequence_search', (req, res) => res.sendFile(path.join(htmlPath, 'sequence_search.html')));
app.get('/header', (req, res) => res.sendFile(path.join(htmlPath, 'header.html')));
app.get('/left_menu', (req, res) => res.sendFile(path.join(htmlPath, 'left_menu.html')));
app.get('/help', (req, res) => res.sendFile(path.join(htmlPath, 'help.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(htmlPath, 'upload.html')));

// STATIC - Fix the path to static files
app.use('/static', express.static(path.join(__dirname, '..', '..', 'src', 'static')));

// 404 handler for API routes
app.use('/upload/*', (req, res) => {
  res.status(404).json({ error: 'Upload endpoint not found', path: req.path });
});

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
  
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
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