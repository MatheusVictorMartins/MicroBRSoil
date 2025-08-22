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
  if (!runId) runId = uuidv4();
  const job = await queue.add('run', { runId, fastqPath, pipelineType, meta }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
  return job;
}

module.exports = { connection, queue, queueEvents, addPipelineJob, QUEUE_NAME };