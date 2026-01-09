const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { pipelines } = require('../utils/fakeDB');
const { addPipelineJob, queue, connection } = require('../queues');
const { paths } = require('../utils/moduleResolver');
const path = require('path');
const fs = require('fs');
const { requireAuth, isAdminRole } = require('../middleware/authenticate');
const { PIPELINE_STATUS, RATE_LIMIT_MESSAGES } = require('../constants');
const { createRateLimiter } = require('../middleware/rateLimit');

// Use moduleResolver so the same code works locally and in Docker
const { getPipelineRun, getPipelineRunsPaginated, getPipelineResults, updatePipelineRunStatus } = require(paths.pipelineFunctions());
const isProduction = process.env.NODE_ENV === 'production';
const CANCEL_MESSAGE = 'Canceled by user';

const pipelineReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: RATE_LIMIT_MESSAGES.PIPELINE_STATUS
});

const pipelineWriteLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: RATE_LIMIT_MESSAGES.PIPELINE_SUBMISSIONS
});

const WORKER_HEARTBEAT_KEY = process.env.WORKER_HEARTBEAT_KEY || 'microbrsoil:worker:heartbeat';
const WORKER_HEARTBEAT_MAX_AGE_MS = Math.max(10_000, Number(process.env.WORKER_HEARTBEAT_MAX_AGE_MS) || 60_000);

// Health checks for queue + worker heartbeat
router.get('/health', requireAuth, pipelineReadLimiter, async (req, res) => {
  const now = new Date();
  const response = {
    success: true,
    time: now.toISOString(),
    redis: { ok: false },
    queue: { ok: false },
    worker: { online: false }
  };

  try {
    await connection.ping();
    response.redis.ok = true;
  } catch (error) {
    response.redis.error = safeErrorMessage(error);
  }

  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed', 'paused');
    response.queue = { ok: true, counts };
  } catch (error) {
    response.queue = { ok: false, error: safeErrorMessage(error) };
  }

  try {
    const raw = await connection.get(WORKER_HEARTBEAT_KEY);
    if (raw) {
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch (parseError) {
        payload = null;
      }
      const updatedAt = payload?.updatedAt ? new Date(payload.updatedAt) : null;
      const ageMs = updatedAt && !Number.isNaN(updatedAt.getTime())
        ? now.getTime() - updatedAt.getTime()
        : null;
      const online = Number.isFinite(ageMs) ? ageMs <= WORKER_HEARTBEAT_MAX_AGE_MS : false;
      response.worker = {
        online,
        ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
        ...payload
      };
    } else {
      response.worker = { online: false, message: 'No heartbeat detected' };
    }
  } catch (error) {
    response.worker = { online: false, error: safeErrorMessage(error) };
  }

  res.json(response);
});

// Get pipeline run status
router.get('/status/:runId', requireAuth, pipelineReadLimiter, async (req, res) => {
  const { runId } = req.params;
  try {
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
    req.logger?.error('Error getting pipeline status', {
      run_id: runId,
      user_id: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Get pipeline results
router.get('/results/:runId', requireAuth, pipelineReadLimiter, async (req, res) => {
  const { runId } = req.params;
  try {
    const pipelineRun = await getPipelineRun(runId);
    if (!pipelineRun) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }

    if (!canAccessRun(req.user, pipelineRun)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (pipelineRun.status !== PIPELINE_STATUS.COMPLETED) {
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
    req.logger?.error('Error getting pipeline results', {
      run_id: runId,
      user_id: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Get user's pipeline runs
router.get('/runs', requireAuth, pipelineReadLimiter, async (req, res) => {
  try {
    const userId = req.user?.id;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.toLowerCase().trim() : '';
    const statusFilter = rawStatus === 'all' ? '' : rawStatus;
    const userFilter = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    const fromDate = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const toDate = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const sortBy = typeof req.query.sort === 'string' ? req.query.sort.toLowerCase().trim() : '';
    const sortOrder = typeof req.query.order === 'string' ? req.query.order.toLowerCase().trim() : '';
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const queryOptions = {
      userId: isAdminRole(req.user?.role) ? null : userId,
      status: statusFilter,
      limit,
      offset,
      userSearch: isAdminRole(req.user?.role) ? userFilter : '',
      from: fromDate,
      to: toDate,
      sortBy,
      sortOrder
    };

    const paged = await getPipelineRunsPaginated(queryOptions);
    const runs = Array.isArray(paged.rows) ? paged.rows : [];
    const totalRecords = Number(paged.total) || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      runs,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit
      }
    });
  } catch (error) {
    req.logger?.error('Error getting user pipeline runs', {
      user_id: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Cancel a pipeline run (queued or running)
router.post('/cancel/:runId', requireAuth, pipelineWriteLimiter, async (req, res) => {
  const { runId } = req.params;
  if (!runId) {
    return res.status(400).json({ success: false, error: 'runId is required' });
  }

  try {
    let dbRun = await getPipelineRun(runId);
    const fallbackRun = pipelines[runId];
    const targetRun = dbRun || fallbackRun;
    if (!targetRun) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }

    if (!canAccessRun(req.user, targetRun)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const normalizedStatus = String(targetRun.status || '').toLowerCase();
    if (normalizedStatus === PIPELINE_STATUS.COMPLETED || normalizedStatus === PIPELINE_STATUS.FAILED) {
      return res.status(409).json({ success: false, error: 'Pipeline already finished.' });
    }

    let queueState = null;
    let removed = false;
    try {
      const job = await queue.getJob(runId);
      if (job) {
        queueState = await job.getState();
        if (['waiting', 'delayed', 'paused'].includes(queueState)) {
          await job.remove();
          removed = true;
        } else if (queueState === 'active') {
          await job.discard();
        }
      }
    } catch (queueError) {
      req.logger?.warn?.('Failed to cancel job in queue', {
        run_id: runId,
        user_id: req.user?.id,
        error: queueError.message
      });
    }

    if (dbRun) {
      const logs = Array.isArray(dbRun.logs) ? [...dbRun.logs] : [];
      if (!logs.includes(CANCEL_MESSAGE)) {
        logs.push(CANCEL_MESSAGE);
      }
      dbRun = await updatePipelineRunStatus(runId, PIPELINE_STATUS.FAILED, CANCEL_MESSAGE, logs);
    }

    if (pipelines[runId]) {
      pipelines[runId].status = PIPELINE_STATUS.FAILED;
      pipelines[runId].finishedAt = new Date().toISOString();
      pipelines[runId].logs = Array.isArray(pipelines[runId].logs) ? pipelines[runId].logs : [];
      if (!pipelines[runId].logs.includes(CANCEL_MESSAGE)) {
        pipelines[runId].logs.push(CANCEL_MESSAGE);
      }
    }

    const message = removed
      ? 'Pipeline canceled.'
      : 'Cancellation requested. The pipeline may take a while to stop.';

    res.json({
      success: true,
      runId,
      queueState,
      removed,
      message
    });
  } catch (error) {
    req.logger?.error?.('Error canceling pipeline run', {
      run_id: runId,
      user_id: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// Legacy routes now enqueue jobs instead of running synchronously
router.post("/illumina", requireAuth, pipelineWriteLimiter, async (req, res) => {
  try {
    const { fastqPath } = req.body;
    if (!fastqPath) return res.status(400).json({ success: false, error: "fastqPath is required." });
    const runId = uuidv4();
    const job = await addPipelineJob({ runId, fastqPath, pipelineType: 'illumina' });
    res.json({ success: true, runId, jobId: job.id, pipelineType: 'illumina' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

router.post("/its", requireAuth, pipelineWriteLimiter, async (req, res) => {
  try {
    const { fastqPath } = req.body;
    if (!fastqPath) return res.status(400).json({ success: false, error: "fastqPath is required." });
    const runId = uuidv4();
    const job = await addPipelineJob({ runId, fastqPath, pipelineType: 'its' });
    res.json({ success: true, runId, jobId: job.id, pipelineType: 'its' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

router.post("/barcodes", requireAuth, pipelineWriteLimiter, async (req, res) => {
  try {
    const { fastqPath, barcodesPath } = req.body;

    if (!fastqPath || !barcodesPath) {
      return res.status(400).json({ success: false, error: "fastqPath and barcodesPath are required." });
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
  const runId = run.run_id || run.id || '';
  const logFile = path.join(RESULTS_DIR, runId, 'pipeline_progress.log');
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

  const runtimeInfo = readRuntimeInfo(runId);
  return { ...run, logs: mergedLogs, runtime_info: runtimeInfo };
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

function readRuntimeInfo(runId) {
  if (!runId) return null;
  const statusFile = path.join(RESULTS_DIR, runId, 'pipeline_status.json');
  if (!fs.existsSync(statusFile)) return null;
  try {
    const content = fs.readFileSync(statusFile, 'utf8');
    const data = JSON.parse(content);
    return data?.runtime || data?.runtime_info || data?.runtimeInfo || null;
  } catch (err) {
    return null;
  }
}
