const { Worker, QueueEvents } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const connection = { url: process.env.REDIS_URL || process.env.REDIS_URL || 'redis://redis:6379' };

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const resultsDir = process.env.RESULTS_DIR || path.join(__dirname, '../../mock_results_csv');

// Ensure dirs
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });

const worker = new Worker('pipeline-jobs', async (job) => {
  const { fastqPath, pipelineType } = job.data; // pipelineType: '16s' | 'its' | 'ion-torrent'
  console.log(`[Worker] Starting job ${job.id} type=${pipelineType} fastq=${fastqPath}`);

  // Map pipelineType to R script path (adjust to your repo structure)
  const scriptMap = {
    '16s': path.join('/app/pipeline-r', 'pipeline_16s.R'),
    'its': path.join('/app/pipeline-r', 'pipeline_its.R'),
    'ion-torrent': path.join('/app/pipeline-r', 'pipeline_ion_torrent.R'),
  };

  const script = scriptMap[pipelineType];
  if (!fs.existsSync(script)) {
    throw new Error(`Pipeline script not found: ${script}`);
  }

  // Execute R script
  // Expect your R scripts to accept: --fastq <path> --outdir <resultsDir>
  await new Promise((resolve, reject) => {
    const args = [script, '--fastq', fastqPath, '--outdir', resultsDir];
    const child = spawn('Rscript', args, { stdio: 'inherit' });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Rscript exit code ${code}`))));
  });

  // Return a pointer to results (e.g., CSV/PNG files)
  return {
    resultsDir,
    files: fs.readdirSync(resultsDir).map((f) => path.join(resultsDir, f)),
  };
}, { connection });

const queueEvents = new QueueEvents('pipeline-jobs', { connection });
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`[Worker] Job ${jobId} completed.`, returnvalue);
});
queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[Worker] Job ${jobId} failed: ${failedReason}`);
});

console.log('[Worker] Pipeline worker started.');
