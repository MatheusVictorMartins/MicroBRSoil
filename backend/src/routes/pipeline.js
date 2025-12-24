const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { pipelines } = require('../utils/fakeDB');
const { addPipelineJob, queue } = require('../queues');
const { paths } = require('../utils/moduleResolver');
const path = require('path');
const fs = require('fs');
const { requireAuth, isAdminRole } = require('../middleware/authenticate');

// Use moduleResolver so the same code works locally and in Docker
const { getPipelineRun, getPipelineRunsByUser, getPipelineRunsAll, getPipelineResults } = require(paths.pipelineFunctions());
const isProduction = process.env.NODE_ENV === 'production';

// Get pipeline run status
router.get('/status/:runId', requireAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    let queueInfo = null;
    try {
      const job = await queue.getJob(runId);
      if (job) {
        const [state, position] = await Promise.all([
          job.getState(),
          job.getPosition().catch(() => null)
        ]);
        queueInfo = { state, position };
      }
    } catch (e) {
      // do not fail the endpoint if queue lookup fails
    }
    
    // Try to get from database first
    const dbRun = await getPipelineRun(runId);
    if (dbRun) {
      if (!canAccessRun(req.user, dbRun)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const runWithLogs = attachPipelineLogs(dbRun);
      return res.json({
        success: true,
        run: runWithLogs,
        queue: queueInfo
      });
    }
    
    // Fallback to fakeDB
    const run = pipelines[runId];
    if (!run) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }

    if (!canAccessRun(req.user, run)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const runWithLogs = attachPipelineLogs(run);
    res.json({ success: true, run: runWithLogs, queue: queueInfo });
  } catch (error) {
    console.error('Error getting pipeline status:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Get pipeline results
router.get('/results/:runId', requireAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    
    const pipelineRun = await getPipelineRun(runId);
    if (!pipelineRun) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }

    if (!canAccessRun(req.user, pipelineRun)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (pipelineRun.status !== 'completed') {
      return res.json({ 
        success: false, 
        error: 'Pipeline not completed yet',
        status: pipelineRun.status
      });
    }
    
    const results = await getPipelineResults(runId);
    
    res.json({
      success: true,
      run: pipelineRun,
      results: results
    });
  } catch (error) {
    console.error('Error getting pipeline results:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Get user's pipeline runs
router.get('/runs', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    let runs = [];
    if (isAdminRole(req.user?.role)) {
      runs = await getPipelineRunsAll(limit);
    } else {
      runs = await getPipelineRunsByUser(userId);
    }

    if (Array.isArray(runs) && runs.length > limit) {
      runs = runs.slice(0, limit);
    }

    res.json({ success: true, runs });
  } catch (error) {
    console.error('Error getting user pipeline runs:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Legacy routes now enqueue jobs instead of running synchronously
router.post("/illumina", requireAuth, async (req, res) => {
  try {
    const { fastqPath } = req.body;
    if (!fastqPath) return res.status(400).json({ success: false, error: "fastqPath é obrigatório." });
    const runId = uuidv4();
    const job = await addPipelineJob({ runId, fastqPath, pipelineType: 'illumina' });
    res.json({ success: true, runId, jobId: job.id, pipelineType: 'illumina' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

router.post("/its", requireAuth, async (req, res) => {
  try {
    const { fastqPath } = req.body;
    if (!fastqPath) return res.status(400).json({ success: false, error: "fastqPath é obrigatório." });
    const runId = uuidv4();
    const job = await addPipelineJob({ runId, fastqPath, pipelineType: 'its' });
    res.json({ success: true, runId, jobId: job.id, pipelineType: 'its' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

router.post("/barcodes", requireAuth, async (req, res) => {
  try {
    const { fastqPath, barcodesPath } = req.body;

    if (!fastqPath || !barcodesPath) {
      return res.status(400).json({ success: false, error: "fastqPath e barcodesPath são obrigatórios." });
    }

    const runId = uuidv4();
    const job = await addPipelineJob({ runId, fastqPath, pipelineType: 'barcode', meta: { barcodesPath } });
    res.json({ success: true, runId, jobId: job.id, pipelineType: 'barcode' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

module.exports = router;

// Helpers
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '..', '..', 'results');
function attachPipelineLogs(run) {
  const logFile = path.join(RESULTS_DIR, run.run_id || run.id || '', 'pipeline_progress.log');
  let fileLogs = [];
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      fileLogs = content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .slice(-50); // keep last 50 lines to avoid huge payloads
    }
  } catch (err) {
    // ignore log read errors
  }

  const mergedLogs = Array.isArray(run.logs) ? [...run.logs] : [];
  if (fileLogs.length) {
    mergedLogs.push(...fileLogs);
  }

  return { ...run, logs: mergedLogs };
}

function canAccessRun(user, run) {
  if (!user || !run) return false;
  if (isAdminRole(user.role)) return true;
  const ownerId = run.user_id ?? run.userId;
  return ownerId !== undefined && String(ownerId) === String(user.id);
}

function safeErrorMessage(err) {
  return isProduction ? 'Internal server error' : err.message;
}
