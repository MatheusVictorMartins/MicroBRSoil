const { Worker, UnrecoverableError } = require('bullmq');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { connection, QUEUE_NAME, queueEvents } = require('../queues');
const { pipelines } = require('../utils/fakeDB');
const { paths } = require('../utils/moduleResolver');

// Import logging system
const { workerLogger } = require('../utils/logger');

const { updatePipelineRunStatus, getPipelineRun } = require(paths.pipelineFunctions());
const { processPipelineResults } = require(paths.resultProcessor());

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, '../../results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

const worker = new Worker(QUEUE_NAME, async job => {
  const { runId, fastqPath, pipelineType, meta } = job.data;
  let lockRenewalInterval; // Declare the interval variable in the job scope
  
  workerLogger.info('Processing pipeline job', {
    jobId: job.id,
    runId,
    pipelineType,
    fastqPath: path.basename(fastqPath)
  });

  try {
    // Check if job is already completed (prevent retry-after-success)
    const state = await job.getState();
    if (state === 'completed') {
      workerLogger.warn(`Job ${job.id} already completed, skipping execution`, { runId, state });
      return { success: true, runId, skipped: true, reason: 'already_completed' };
    }
    
    // Renew job lock periodically for long-running processes (e.g., R pipelines)
    // Increased lock duration to 10 minutes and renewal interval to 30 seconds
    lockRenewalInterval = setInterval(async () => {
      try {
        await job.updateProgress(50); // Keep job alive
        await job.extendLock(job.token, 600000); // Extend lock by 10 minutes (was 5)
        workerLogger.debug(`Renewed lock for job ${job.id}`, { runId });
      } catch (error) {
        workerLogger.warn(`Failed to renew lock for job ${job.id}`, { error: error.message, runId });
      }
    }, 30000); // Renew every 30 seconds (more stable than 15s)

    // Update status in both fakeDB and database
    if (!pipelines[runId]) {
      pipelines[runId] = { id: runId, status: 'running', createdAt: new Date().toISOString(), logs: [] };
    } else {
      pipelines[runId].status = 'running';
    }
    pipelines[runId].startedAt = new Date().toISOString();
    pipelines[runId].logs.push(`Job ${job.id} started`);

    // Update database status
    await updatePipelineRunStatus(runId, 'running');

    // Create run-specific output directory
    const runOutputDir = path.join(RESULTS_DIR, runId);
    if (!fs.existsSync(runOutputDir)) fs.mkdirSync(runOutputDir, { recursive: true });

    // Execute the appropriate pipeline based on type using R integration
    let result;
    workerLogger.info(`Executing ${pipelineType} pipeline`, { runId, outputDir: runOutputDir });
    pipelines[runId].logs.push(`Starting ${pipelineType} pipeline execution`);

    switch (pipelineType) {
      case 'illumina':
      case '16s':
      case 'default':
        const runIlluminaPipeline = require('../integrations/run_illumina');
        result = await runIlluminaPipeline(fastqPath, runOutputDir);
        break;
        
      case 'iontorrent':
      case 'ion':
        const runIonTorrentPipeline = require('../integrations/run_iontorrent');
        result = await runIonTorrentPipeline(fastqPath, runOutputDir);
        break;
        
      case 'its':
      case 'fungi':
        const runITSPipeline = require('../integrations/run_its');
        result = await runITSPipeline(fastqPath, runOutputDir);
        break;
        
      case 'barcode':
      case 'barcodes':
        const runBarcodePipeline = require('../integrations/index2');
        // For barcode pipeline, we need barcodes file (assume it's provided in meta)
        const barcodesPath = meta.barcodesPath || '/app/pipeline-r/barcodes/barcodes_16S.fa';
        result = await runBarcodePipeline(fastqPath, barcodesPath, runOutputDir);
        break;
        
      default:
        throw new Error(`Unknown pipeline type: ${pipelineType}`);
    }

    console.log('✅ Pipeline execution completed');
    pipelines[runId].logs.push('Pipeline execution completed successfully');

    // Process results and store in database (keep lock alive during this)
    const userId = meta?.uploadedBy && meta.uploadedBy !== 'anonymous' ? meta.uploadedBy : null;
    await processPipelineResults(runId, runOutputDir, userId, pipelineType);
    
    // Update database status
    pipelines[runId].status = 'completed';
    pipelines[runId].finishedAt = new Date().toISOString();
    await updatePipelineRunStatus(runId, 'completed', null, pipelines[runId].logs);
    
    console.log(`✅ Pipeline job ${runId} completed successfully`);
    
    return { success: true, runId, outputDir: runOutputDir, result };
    
  } catch (error) {
    console.error('Pipeline worker error:', error);
    
    // Update status in fakeDB and database
    pipelines[runId].status = 'failed';
    pipelines[runId].logs.push(`Worker error: ${error.message}`);
    
    try {
      await updatePipelineRunStatus(runId, 'failed', error.message, pipelines[runId].logs);
    } catch (dbError) {
      console.error('Database update error:', dbError);
    }
    
    // Check if error is non-recoverable (should not retry)
    const errorMsg = error.message || '';
    const isNonRecoverable = 
      errorMsg.includes('no package called') ||           // Missing R package
      errorMsg.includes('there is no package called') ||  // Missing R package (alternate)
      errorMsg.includes('could not find function') ||     // Missing R function
      errorMsg.includes('Unknown pipeline type') ||       // Invalid pipeline type
      errorMsg.includes('FASTQ files not found') ||       // Missing input files
      errorMsg.includes('Metadata file not found') ||     // Missing metadata
      errorMsg.includes('permission denied');             // Permission error
    
    if (isNonRecoverable) {
      workerLogger.error('Non-recoverable error detected, will not retry', {
        runId,
        error: errorMsg
      });
      throw new UnrecoverableError(`Non-recoverable: ${errorMsg}`);
    }
    
    throw error;
  } finally {
    // Always clear the lock renewal interval, regardless of success or failure
    if (lockRenewalInterval) {
      clearInterval(lockRenewalInterval);
      workerLogger.debug(`Lock renewal interval cleared for job ${runId}`);
    }
    
    // Extend lock one final time to allow BullMQ to finalize the job
    // This prevents "Missing lock" errors during completion/failure handling
    try {
      await job.extendLock(job.token, 60000); // 1 minute for finalization
      workerLogger.debug(`Final lock extension for job ${runId}`);
    } catch (lockError) {
      // Not critical - job may already be finalized
      workerLogger.debug(`Could not extend lock during finalization: ${lockError.message}`);
    }
  }
}, { 
  connection,
  concurrency: 1, // Process one job at a time to avoid resource conflicts
  stalledInterval: 120 * 1000, // 120 seconds (2 minutes)
  maxStalledCount: 2, // Allow up to 2 stalls before considering failed (reduced to prevent duplicates)
  lockDuration: 600 * 1000, // 10 minutes lock duration (matches manual renewal interval)
  lockRenewTime: 300 * 1000, // Renew lock when half the duration has elapsed (5 minutes)
});

worker.on('completed', async (job) => {
  console.log('worker completed job', job.id);
  const { runId } = job.data;
  
  try {
    // Ensure database is updated
    const dbRun = await getPipelineRun(runId);
    if (dbRun && dbRun.status !== 'completed') {
      await updatePipelineRunStatus(runId, 'completed');
    }
  } catch (error) {
    console.error('Error updating completed job in database:', error);
  }
});

worker.on('failed', async (job, err) => {
  console.error('worker job failed', job?.id, err);
  const { runId } = job?.data || {};
  
  if (runId) {
    try {
      // Ensure database is updated
      const dbRun = await getPipelineRun(runId);
      if (dbRun && dbRun.status !== 'failed') {
        await updatePipelineRunStatus(runId, 'failed', err.message);
      }
    } catch (error) {
      console.error('Error updating failed job in database:', error);
    }
  }
});

// keep fakeDB in sync for externally-completed/failed events
queueEvents.on('completed', async ({ jobId }) => {
  const run = Object.values(pipelines).find(p => String(p.jobId) === String(jobId));
  if (run) {
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.logs.push(`Job ${jobId} completed (queue event)`);
    
    try {
      await updatePipelineRunStatus(run.id, 'completed', null, run.logs);
    } catch (error) {
      console.error('Error updating completed event in database:', error);
    }
  }
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
  const run = Object.values(pipelines).find(p => String(p.jobId) === String(jobId));
  if (run) {
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    run.logs.push(`Job ${jobId} failed (queue event): ${failedReason}`);
    
    try {
      await updatePipelineRunStatus(run.id, 'failed', failedReason, run.logs);
    } catch (error) {
      console.error('Error updating failed event in database:', error);
    }
  }
});

// graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});