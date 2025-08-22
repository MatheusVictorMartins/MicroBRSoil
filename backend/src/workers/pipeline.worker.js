const { Worker } = require('bullmq');
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
  
  workerLogger.info('Processing pipeline job', {
    jobId: job.id,
    runId,
    pipelineType,
    fastqPath: path.basename(fastqPath)
  });

  try {
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

    // Process results and store in database
    const userId = meta?.uploadedBy && meta.uploadedBy !== 'anonymous' ? meta.uploadedBy : null;
    await processPipelineResults(runId, runOutputDir, userId);
    
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
    
    throw error;
  }
}, { connection });

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