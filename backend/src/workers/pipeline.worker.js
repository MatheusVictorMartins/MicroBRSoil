const { Worker } = require('bullmq');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const fs = require('fs');
const { connection, QUEUE_NAME, queueEvents, queue } = require('../queues');
const { pipelines } = require('../utils/fakeDB');
const { paths } = require('../utils/moduleResolver');
const { PIPELINE_STATUS } = require('../constants');
const CANCEL_MESSAGE = 'Canceled by user';

// Import logging system
const { workerLogger } = require('../utils/logger');

const { updatePipelineRunStatus, getPipelineRun, resetActivePipelineRuns } = require(paths.pipelineFunctions());
const { processPipelineResults } = require(paths.resultProcessor());

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '../../results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

const WORKER_HEARTBEAT_KEY = process.env.WORKER_HEARTBEAT_KEY || 'microbrsoil:worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS) || 15000;
const HEARTBEAT_TTL_SEC = Math.max(30, Math.ceil(HEARTBEAT_INTERVAL_MS / 1000) * 4);
const WORKER_LOCK_DURATION_MS = Number(process.env.WORKER_LOCK_DURATION_MS) || 6 * 60 * 60 * 1000;
const WORKER_LOCK_RENEW_MS = Number(process.env.WORKER_LOCK_RENEW_MS) || 5 * 60 * 1000;
const PIPELINE_CANCEL_POLL_MS = Number(process.env.PIPELINE_CANCEL_POLL_MS) || 5000;
const PIPELINE_CANCEL_KILL_MS = Number(process.env.PIPELINE_CANCEL_KILL_MS) || 10000;
const workerIdentity = {
  pid: process.pid,
  host: os.hostname(),
  queue: QUEUE_NAME,
  startedAt: new Date().toISOString()
};
let heartbeatIntervalId = null;

async function writeHeartbeat(state = 'online') {
  try {
    const payload = {
      ...workerIdentity,
      state,
      updatedAt: new Date().toISOString()
    };
    await connection.set(WORKER_HEARTBEAT_KEY, JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SEC);
  } catch (error) {
    workerLogger?.warn?.('Failed to write worker heartbeat', { error: error.message });
  }
}

function startHeartbeat() {
  if (heartbeatIntervalId) return;
  void writeHeartbeat('online');
  heartbeatIntervalId = setInterval(() => {
    void writeHeartbeat('online');
  }, HEARTBEAT_INTERVAL_MS);
}

async function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  try {
    await connection.del(WORKER_HEARTBEAT_KEY);
  } catch (error) {
    // ignore cleanup errors
  }
}

function ensureInputExists(inputPath) {
  if (!inputPath) {
    throw new Error('Input path not provided for pipeline job');
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path not found: ${inputPath}`);
  }

  const stats = fs.statSync(inputPath);
  if (stats.isDirectory()) {
    const candidates = fs.readdirSync(inputPath).filter(f => f.match(/\.fastq(\.gz)?$/i));
    if (candidates.length === 0) {
      throw new Error(`No FASTQ files found in ${inputPath}`);
    }
  } else if (stats.isFile()) {
    if (stats.size === 0) {
      throw new Error(`Input file is empty: ${inputPath}`);
    }
  }
}

function isCanceledRun(run) {
  if (!run) return false;
  const status = String(run.status || '').toLowerCase();
  const errorMessage = String(run.error_message || '').toLowerCase();
  return status === PIPELINE_STATUS.FAILED && errorMessage === CANCEL_MESSAGE.toLowerCase();
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    try {
      child.kill(signal);
    } catch (killErr) {
      // ignore kill failures
    }
  }
}

async function runPipelineInChild({ runId, pipelineType, fastqPath, outputDir, barcodesPath }) {
  const jobPayload = {
    runId,
    pipelineType,
    fastqPath,
    outputDir,
    barcodesPath: barcodesPath || null
  };
  const childScript = path.join(__dirname, 'run_pipeline_job.js');
  const child = fork(childScript, [], {
    env: {
      ...process.env,
      PIPELINE_JOB_PAYLOAD: JSON.stringify(jobPayload)
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    detached: true
  });

  let canceled = false;
  let killTimer = null;
  const stderrChunks = [];

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      const message = data.toString();
      if (message) {
        stderrChunks.push(message);
        if (stderrChunks.length > 20) stderrChunks.shift();
      }
    });
  }

  const cancelCheck = async () => {
    try {
      const latest = await getPipelineRun(runId);
      if (isCanceledRun(latest)) {
        canceled = true;
        killProcessTree(child, 'SIGTERM');
        if (!killTimer) {
          killTimer = setTimeout(() => {
            killProcessTree(child, 'SIGKILL');
          }, PIPELINE_CANCEL_KILL_MS);
        }
      }
    } catch (error) {
      // ignore cancel check errors
    }
  };

  const cancelInterval = setInterval(cancelCheck, PIPELINE_CANCEL_POLL_MS);

  return new Promise((resolve, reject) => {
    child.on('error', (error) => {
      clearInterval(cancelInterval);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });

    child.on('exit', (code, signal) => {
      clearInterval(cancelInterval);
      if (killTimer) clearTimeout(killTimer);
      if (canceled) {
        const cancelError = new Error(CANCEL_MESSAGE);
        cancelError.code = 'CANCELED';
        return reject(cancelError);
      }
      if (code === 0) {
        return resolve({ success: true });
      }
      const stderr = stderrChunks.join('').trim();
      const details = stderr ? ` ${stderr}` : '';
      const error = new Error(`Pipeline execution failed (code ${code || 1}).${details}`);
      error.exitCode = code || 1;
      error.signal = signal;
      reject(error);
    });
  });
}

let worker = null;

async function clearQueueOnStartup() {
  if (String(process.env.CLEAR_PIPELINE_QUEUE_ON_STARTUP || '').toLowerCase() !== 'true') return;
  try {
    const cleared = await queue.obliterate({ force: true });
    workerLogger.info('Cleared pipeline queue on startup', { cleared });
  } catch (error) {
    workerLogger.warn('Failed to clear pipeline queue on startup', { error: error.message });
  }
  try {
    const clearedRuns = await resetActivePipelineRuns('Cleared on restart');
    if (clearedRuns.length) {
      workerLogger.info('Reset active pipeline runs after restart', { count: clearedRuns.length });
    }
  } catch (error) {
    workerLogger.warn('Failed to reset pipeline runs on startup', { error: error.message });
  }
}

async function initializeWorker() {
  await clearQueueOnStartup();
  worker = new Worker(QUEUE_NAME, async job => {
  const { runId, fastqPath, pipelineType, meta } = job.data;
  const metaUserId = meta?.uploadedBy;
  let userId = null;
  if (metaUserId !== undefined && metaUserId !== null && metaUserId !== '' && metaUserId !== 'anonymous') {
    const parsedUserId = Number(metaUserId);
    userId = Number.isNaN(parsedUserId) ? null : parsedUserId;
  }
  let dbRun = null;
  try {
    dbRun = await getPipelineRun(runId);
  } catch (error) {
    dbRun = null;
  }
  if (!userId) {
    userId = dbRun?.user_id ?? null;
  }

  const logMeta = {
    run_id: runId,
    user_id: userId,
    job_id: job.id,
    pipeline_type: pipelineType
  };

  workerLogger.info('Processing pipeline job', {
    ...logMeta,
    fastq_path: path.basename(fastqPath || '')
  });

  try {
    if (isCanceledRun(dbRun)) {
      workerLogger.info('Skipping canceled pipeline run', { ...logMeta });
      const cancelError = new Error(CANCEL_MESSAGE);
      cancelError.code = 'CANCELED';
      throw cancelError;
    }

    // Check if job is already completed (prevent retry-after-success)
    const state = await job.getState();
    if (state === 'completed') {
      workerLogger.warn('Job already completed, skipping execution', { ...logMeta, state });
      return { success: true, runId, skipped: true, reason: 'already_completed' };
    }

    // Update status in both fakeDB and database
    if (!pipelines[runId]) {
      pipelines[runId] = { id: runId, status: PIPELINE_STATUS.RUNNING, createdAt: new Date().toISOString(), logs: [] };
    } else {
      pipelines[runId].status = PIPELINE_STATUS.RUNNING;
    }
    pipelines[runId].startedAt = new Date().toISOString();
    pipelines[runId].logs.push(`Job ${job.id} started`);

    // Update database status
    await updatePipelineRunStatus(runId, PIPELINE_STATUS.RUNNING);

    // Create run-specific output directory
    const runOutputDir = path.join(RESULTS_DIR, runId);
    if (!fs.existsSync(runOutputDir)) fs.mkdirSync(runOutputDir, { recursive: true });

    // Fail fast if input no longer exists (e.g., deleted uploads)
    try {
      ensureInputExists(fastqPath);
    } catch (inputErr) {
      pipelines[runId].status = PIPELINE_STATUS.FAILED;
      pipelines[runId].logs.push(`Input validation failed: ${inputErr.message}`);
      await updatePipelineRunStatus(runId, PIPELINE_STATUS.FAILED, inputErr.message, pipelines[runId].logs);
      workerLogger.warn('Skipping job due to missing/invalid input', { ...logMeta, fastq_path: fastqPath, error: inputErr.message });
      // Do not throw: complete the job to avoid endless retries on missing inputs
      return { success: false, runId, skipped: true, reason: 'missing_input', error: inputErr.message };
    }

    // Execute the appropriate pipeline based on type using R integration
    let result = null;
    const normalizedPipelineType = String(pipelineType || '').toLowerCase();
    workerLogger.info('Executing pipeline', { ...logMeta, output_dir: runOutputDir });
    pipelines[runId].logs.push(`Starting ${pipelineType} pipeline execution`);

    switch (normalizedPipelineType) {
      case 'illumina':
      case '16s':
      case 'default':
        await runPipelineInChild({
          runId,
          pipelineType: 'illumina',
          fastqPath,
          outputDir: runOutputDir
        });
        break;
        
      case 'iontorrent':
      case 'ion':
        await runPipelineInChild({
          runId,
          pipelineType: 'iontorrent',
          fastqPath,
          outputDir: runOutputDir,
          barcodesPath: meta?.barcodesPath
        });
        break;
        
      case 'its':
      case 'fungi':
        await runPipelineInChild({
          runId,
          pipelineType: 'its',
          fastqPath,
          outputDir: runOutputDir
        });
        break;
        
      case 'barcode':
      case 'barcodes':
        throw new Error('Barcode pipeline is not available in this worker.');
        break;
        
      default:
        throw new Error(`Unknown pipeline type: ${pipelineType}`);
    }

    workerLogger.info('Pipeline execution completed', logMeta);
    pipelines[runId].logs.push('Pipeline execution completed successfully');

    const latestRun = await getPipelineRun(runId).catch(() => null);
    if (isCanceledRun(latestRun)) {
      if (!pipelines[runId]) {
        pipelines[runId] = { id: runId, status: PIPELINE_STATUS.FAILED, createdAt: new Date().toISOString(), logs: [] };
      }
      pipelines[runId].status = PIPELINE_STATUS.FAILED;
      pipelines[runId].finishedAt = new Date().toISOString();
      pipelines[runId].logs = Array.isArray(pipelines[runId].logs) ? pipelines[runId].logs : [];
      if (!pipelines[runId].logs.includes(CANCEL_MESSAGE)) {
        pipelines[runId].logs.push(CANCEL_MESSAGE);
      }
      await updatePipelineRunStatus(runId, PIPELINE_STATUS.FAILED, CANCEL_MESSAGE, pipelines[runId].logs);
      workerLogger.info('Pipeline canceled, skipping result processing', { ...logMeta });
      return { success: false, runId, canceled: true };
    }

    // Process results and store in database
    await processPipelineResults(runId, runOutputDir, userId, pipelineType);
    
    // Update database status
    pipelines[runId].status = PIPELINE_STATUS.COMPLETED;
    pipelines[runId].finishedAt = new Date().toISOString();
    await updatePipelineRunStatus(runId, PIPELINE_STATUS.COMPLETED, null, pipelines[runId].logs);
    
    workerLogger.info('Pipeline job completed successfully', { ...logMeta, output_dir: runOutputDir });
    
    return { success: true, runId, outputDir: runOutputDir, result };
    
  } catch (error) {
    workerLogger.error('Pipeline worker error', { ...logMeta, error: error.message, stack: error.stack });
    
    // Update status in fakeDB and database
    pipelines[runId].status = PIPELINE_STATUS.FAILED;
    pipelines[runId].logs.push(`Worker error: ${error.message}`);
    
    try {
      await updatePipelineRunStatus(runId, PIPELINE_STATUS.FAILED, error.message, pipelines[runId].logs);
    } catch (dbError) {
      workerLogger.error('Database update error', { ...logMeta, error: dbError.message, stack: dbError.stack });
    }
    
    throw error;
  }
  }, { 
    connection,
    concurrency: 1, // Process one job at a time to avoid resource conflicts
    stalledInterval: 300 * 1000, // 5 minutes before checking for stalled jobs
    maxStalledCount: 1, // Consider stalled once; avoid endless retries
    lockDuration: WORKER_LOCK_DURATION_MS, // Allow long-running pipelines to finish without losing lock
    lockRenewTime: WORKER_LOCK_RENEW_MS, // Renew lock periodically during long runs
  });

  startHeartbeat();

  worker.on('completed', async (job) => {
  const { runId } = job.data;
  workerLogger.info('Worker completed job', { job_id: job.id, run_id: runId });
  
  try {
    // Ensure database is updated
    const dbRun = await getPipelineRun(runId);
    if (isCanceledRun(dbRun)) {
      workerLogger.info('Job completed after cancellation request', { job_id: job.id, run_id: runId });
      return;
    }
    if (dbRun && dbRun.status !== PIPELINE_STATUS.COMPLETED) {
      await updatePipelineRunStatus(runId, PIPELINE_STATUS.COMPLETED);
    }
  } catch (error) {
    workerLogger.error('Error updating completed job in database', { job_id: job.id, run_id: runId, error: error.message, stack: error.stack });
  }
  });

  worker.on('failed', async (job, err) => {
  const { runId } = job?.data || {};
  workerLogger.error('Worker job failed', { job_id: job?.id, run_id: runId, error: err?.message, stack: err?.stack });
  
  if (runId) {
    try {
      // Ensure database is updated
      const dbRun = await getPipelineRun(runId);
      if (dbRun && dbRun.status !== PIPELINE_STATUS.FAILED) {
        await updatePipelineRunStatus(runId, PIPELINE_STATUS.FAILED, err.message);
      }
    } catch (error) {
      workerLogger.error('Error updating failed job in database', { job_id: job?.id, run_id: runId, error: error.message, stack: error.stack });
    }
  }
  });
}

initializeWorker().catch((error) => {
  workerLogger.error('Worker initialization failed', { error: error.message, stack: error.stack });
  process.exit(1);
});

// keep fakeDB in sync for externally-completed/failed events
queueEvents.on('completed', async ({ jobId }) => {
  const run = Object.values(pipelines).find(p => String(p.jobId) === String(jobId));
  if (run) {
    try {
      const dbRun = await getPipelineRun(run.id);
      if (isCanceledRun(dbRun)) {
        workerLogger.info('Skip completion update for canceled run', { job_id: jobId, run_id: run.id });
        return;
      }
    } catch (error) {
      // ignore lookup errors and fall back to local state
    }
    run.status = PIPELINE_STATUS.COMPLETED;
    run.completedAt = new Date().toISOString();
    run.logs.push(`Job ${jobId} completed (queue event)`);
    
    try {
      await updatePipelineRunStatus(run.id, PIPELINE_STATUS.COMPLETED, null, run.logs);
    } catch (error) {
      workerLogger.error('Error updating completed event in database', { job_id: jobId, error: error.message, stack: error.stack });
    }
  }
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
  const run = Object.values(pipelines).find(p => String(p.jobId) === String(jobId));
  if (run) {
    run.status = PIPELINE_STATUS.FAILED;
    run.completedAt = new Date().toISOString();
    run.logs.push(`Job ${jobId} failed (queue event): ${failedReason}`);
    
    try {
      await updatePipelineRunStatus(run.id, PIPELINE_STATUS.FAILED, failedReason, run.logs);
    } catch (error) {
      workerLogger.error('Error updating failed event in database', { job_id: jobId, error: error.message, stack: error.stack });
    }
  }
});

// graceful shutdown
process.on('SIGINT', async () => {
  workerLogger.info('Shutting down worker', { signal: 'SIGINT' });
  await stopHeartbeat();
  if (worker) {
    await worker.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  workerLogger.info('Shutting down worker', { signal: 'SIGTERM' });
  await stopHeartbeat();
  if (worker) {
    await worker.close();
  }
  process.exit(0);
});
