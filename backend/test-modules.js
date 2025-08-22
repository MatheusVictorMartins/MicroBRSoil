require('dotenv').config();

// Test module path resolution
console.log('Testing module path resolution...');

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Working directory:', process.cwd());

try {
  // Test database connection path
  const dbPath = '/app/db/db';
  console.log('Testing DB path:', dbPath);
  const db = require(dbPath);
  console.log('Database module loaded successfully');
  
  // Test pipeline functions path
  const pipelineFunctionsPath = '/app/db/db_functions/pipeline_functions';
  console.log('Testing pipeline functions path:', pipelineFunctionsPath);
  const pipelineFunctions = require(pipelineFunctionsPath);
  console.log('Pipeline functions loaded successfully');
  
  // Test result processor path
  const resultProcessorPath = '/app/db/utilities/result_processor';
  console.log('Testing result processor path:', resultProcessorPath);
  const resultProcessor = require(resultProcessorPath);
  console.log('Result processor loaded successfully');
  
  console.log('All modules loaded successfully!');
  
} catch (error) {
  console.error('Module loading failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
