// Load environment variables first
require('dotenv').config();
const path = require('path');

//console.log(process.env);

const { connection, queue } = require('./src/queues');

// Database module path - works for both Docker and local development
const DB_PATH = '/app/db/db.js';

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