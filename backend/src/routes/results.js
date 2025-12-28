const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { paths } = require('../utils/moduleResolver');
const { requireAuth, isAdminRole } = require('../middleware/authenticate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createResponseCache } = require('../middleware/responseCache');
const isProduction = process.env.NODE_ENV === 'production';

const resultsReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many results requests. Please slow down.'
});

const resultsListCache = createResponseCache({
  ttlMs: 30 * 1000,
  maxEntries: 200,
  keyPrefix: 'results:files'
});

// Use dynamic paths that work in both local development and Docker
const { getPipelineRun, getPipelineResults } = require(paths.pipelineFunctions());

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '../../results');

// Serve result files
router.get('/download/:runId/:filename', requireAuth, resultsReadLimiter, async (req, res) => {
  try {
    const { runId, filename } = req.params;
    
    const pipelineRun = await getPipelineRun(runId);
    if (!pipelineRun) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    
    if (!canAccessRun(req.user, pipelineRun)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const filePath = path.join(RESULTS_DIR, runId, filename);
    
    // Security check: ensure file is within the results directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedResultsDir = path.normalize(path.join(RESULTS_DIR, runId));
    
    if (!normalizedFilePath.startsWith(normalizedResultsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      contentType = `image/${ext.substring(1)}`;
    } else if (ext === '.rds') {
      contentType = 'application/octet-stream';
    } else if (ext === '.txt') {
      contentType = 'text/plain';
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving result file:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
  }
});

// List result files for a run
router.get('/files/:runId', requireAuth, resultsReadLimiter, resultsListCache, async (req, res) => {
  try {
    const { runId } = req.params;
    
    // Verify the pipeline run exists
    const pipelineRun = await getPipelineRun(runId);
    if (!pipelineRun) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    
    if (!canAccessRun(req.user, pipelineRun)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const runResultsDir = path.join(RESULTS_DIR, runId);
    
    if (!fs.existsSync(runResultsDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(runResultsDir)
      .filter(file => fs.statSync(path.join(runResultsDir, file)).isFile())
      .map(file => {
        const filePath = path.join(runResultsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          downloadUrl: `/api/results/download/${runId}/${file}`
        };
      });
    
    res.json({ files });
    
  } catch (error) {
    console.error('Error listing result files:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
  }
});

module.exports = router;

function canAccessRun(user, run) {
  if (!user || !run) return false;
  if (isAdminRole(user.role)) return true;
  const ownerId = run.user_id ?? run.userId;
  return ownerId !== undefined && String(ownerId) === String(user.id);
}

function safeErrorMessage(err) {
  return isProduction ? 'Internal server error' : err.message;
}
