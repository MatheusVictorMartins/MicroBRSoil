const { Queue, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// Handle connection events
connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

const QUEUE_NAME = 'pipeline-jobs';
const queue = new Queue(QUEUE_NAME, { connection });
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

async function addPipelineJob({ runId, fastqPath, pipelineType, meta = {} }) {
  const fs = require('fs');
  const path = require('path');
  
  if (!runId) runId = uuidv4();
  
  // Pre-flight validation for Illumina pipeline
  if (pipelineType === 'illumina') {
    // Check if fastqPath is a directory or file
    let fastqDir;
    
    try {
      const stats = fs.statSync(fastqPath);
      fastqDir = stats.isDirectory() ? fastqPath : path.dirname(fastqPath);
    } catch (err) {
      throw new Error(`Invalid fastqPath: ${fastqPath} does not exist`);
    }
    
    // List all files in the directory
    const allFiles = fs.readdirSync(fastqDir);
    
    // Find FASTQ files matching Illumina naming convention
    // Support both patterns: *_R1_001.fastq.gz and *_L001_R1_001.fastq.gz (with lane number)
    const r1Files = allFiles.filter(f => f.match(/_(L\d{3}_)?R1_001\.fastq(\.gz)?$/i));
    const r2Files = allFiles.filter(f => f.match(/_(L\d{3}_)?R2_001\.fastq(\.gz)?$/i));
    
    if (r1Files.length === 0 || r2Files.length === 0) {
      throw new Error(
        `No valid paired-end FASTQ files found in ${fastqDir}. ` +
        `Illumina pipeline requires files matching *_R1_001.fastq.gz or *_L001_R1_001.fastq.gz. ` +
        `Found files: ${allFiles.join(', ')}`
      );
    }
    
    console.log(`✅ Validated FASTQ files for runId ${runId}: ${r1Files.length} R1 files, ${r2Files.length} R2 files`);
  }
  
  const job = await queue.add('run', { runId, fastqPath, pipelineType, meta }, {
    attempts: 1,  // No retries - fail immediately on error
    removeOnComplete: 1000,
    removeOnFail: 1000,
    delay: 0,
    priority: 1,
    jobId: runId,
    removeOnComplete: 10,
    removeOnFail: 50
  });
  return job;
}

module.exports = { connection, queue, queueEvents, addPipelineJob, QUEUE_NAME };