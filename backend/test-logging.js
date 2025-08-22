// Simple test script to verify logging system
const { apiLogger, workerLogger, dbLogger } = require('./src/utils/logger');

console.log('Testing logging system...');

// Test each logger
apiLogger.info('API logger test message');
apiLogger.error('API error test', { testData: 'sample error' });

workerLogger.info('Worker logger test message');
workerLogger.warn('Worker warning test', { jobId: 'test-123' });

dbLogger.info('Database logger test message');
dbLogger.debug('Database debug test', { query: 'SELECT * FROM test' });

console.log('Logging test completed. Check log files in /app/logs directory.');
