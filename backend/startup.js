// Load environment variables first
require('dotenv').config();
const path = require('path');

//console.log(process.env);

const { connection, queue } = require('./src/queues');
const { paths } = require('./src/utils/moduleResolver');

// Database module path - works for both Docker and local development
const DB_PATH = paths.db();

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('__dirname:', __dirname);
console.log('DB_PATH:', path.resolve(__dirname, DB_PATH));

const pool = require(DB_PATH);

async function checkDependencies() {
  console.log('Checking dependencies...');
  
  try {
    // Test database connection
    console.log('Testing database connection...');
    await pool.query('SELECT 1');
    console.log('Database connected');
    
    // Test Redis connection
    console.log('Testing Redis connection...');
    await connection.ping();
    console.log('Redis connected');

    // Reset pipeline queue on startup to avoid stale jobs
    console.log('Resetting pipeline queue (drain/clean/obliterate)...');
    try {
      await queue.pause();
      await queue.drain();
      await queue.clean(0, 'active');
      await queue.clean(0, 'completed');
      await queue.clean(0, 'failed');
      await queue.clean(0, 'wait');
      await queue.clean(0, 'paused');
      await queue.obliterate({ force: true });
      await queue.resume();
      console.log('Queue reset done.');
    } catch (queueErr) {
      console.warn('Queue reset warning:', queueErr.message);
    }

    // Mark stale queued/running pipelines as failed after queue reset
    try {
      const message = 'Pipeline interrompido apos reinicio da fila.';
      const result = await pool.query(
        `UPDATE microbrsoil_db.pipeline_runs
         SET status = 'failed',
             finished_at = CURRENT_TIMESTAMP,
             error_message = $1
         WHERE status IN ('queued', 'running')
           AND finished_at IS NULL`,
        [message]
      );
      console.log(`Stale pipeline runs updated: ${result.rowCount}`);
    } catch (dbErr) {
      console.warn('Failed to update stale pipeline runs:', dbErr.message);
    }
    
    // Test queue functionality
    console.log('Testing queue functionality...');
    const waiting = await queue.getWaiting();
    console.log(`Queue accessible, ${waiting.length} jobs waiting`);
    
    console.log('All dependencies ready!');
    
    // Start the main application
    console.log('Starting main application...');
    try {
      require('./src/index');
      console.log('Main application started successfully');
    } catch (error) {
      console.error('Failed to start main application:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Dependency check failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  try {
    await queue.close();
    await connection.quit();
    await pool.end();
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during shutdown:', error.message);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(' Received SIGINT, shutting down...');
  try {
    await queue.close();
    await connection.quit();
    await pool.end();
    console.log(' Cleanup completed');
  } catch (error) {
    console.error('Error during shutdown:', error.message);
  }
  process.exit(0);
});

checkDependencies();
