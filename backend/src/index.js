const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const pipelineRoutes = require('./routes/pipeline');
const taxonSearch = require('./routes/taxon');
const seqSearch = require('./routes/sequenceSearch');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ROUTES
app.use('/auth', authRoutes);
app.use('/upload', uploadRoutes);
app.use('/pipeline', pipelineRoutes);
app.use('/taxon_search', taxonSearch);
app.use('/sequence_search', seqSearch);

// JOINS
const htmlPath = path.join(__dirname, 'src', 'html');

app.get('/', (req, res) => res.sendFile(path.join(htmlPath, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(htmlPath, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(htmlPath, 'register.html')));
app.get('/geosearch', (req, res) => res.sendFile(path.join(htmlPath, 'geosearch.html')));
//app.get('/sequence_search', (req, res) => res.sendFile(path.join(htmlPath, 'sequence_search.html')));
app.get('/header', (req, res) => res.sendFile(path.join(htmlPath, 'header.html')));
app.get('/left_menu', (req, res) => res.sendFile(path.join(htmlPath, 'left_menu.html')));
app.get('/help', (req, res) => res.sendFile(path.join(htmlPath, 'help.html')));

// STATIC
app.use('/static', express.static(path.join(__dirname, 'src', 'static')));

// Start server when run directly and expose a health endpoint
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.get('/_health', (req, res) => res.json({ ok: true, pid: process.pid }));

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
  });
}

module.exports = app;