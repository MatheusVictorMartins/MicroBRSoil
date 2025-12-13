/**
 * Module resolver for handling different paths in development vs Docker
 */

const path = require('path');
const fs = require('fs');

function resolvePath(localPath, dockerPath) {
  // Prefer docker path when present, otherwise fall back to local path
  if (dockerPath && fs.existsSync(dockerPath)) return dockerPath;
  if (localPath && fs.existsSync(localPath)) return localPath;
  return dockerPath || localPath;
}

function requireModule(localPath, dockerPath) {
  const modulePath = resolvePath(localPath, dockerPath);
  return require(modulePath);
}

module.exports = {
  resolvePath,
  requireModule,
  
  // Common paths
  paths: {
    db: () => resolvePath(
      path.resolve(__dirname, '../../../db/db.js'),
      '/app/db/db.js'
    ),
    pipelineFunctions: () => resolvePath(
      path.resolve(__dirname, '../../../db/db_functions/pipeline_functions.js'),
      '/app/db/db_functions/pipeline_functions.js'
    ),
    resultProcessor: () => resolvePath(
      path.resolve(__dirname, '../../../db/utilities/result_processor.js'),
      '/app/db/utilities/result_processor.js'
    ),
    alphaFunctions: () => resolvePath(
      path.resolve(__dirname, '../../../db/db_functions/alpha_functions.js'),
      '/app/db/db_functions/alpha_functions.js'
    ),
    sampleFunctions: () => resolvePath(
      path.resolve(__dirname, '../../../db/db_functions/sample_funtion.js'),
      '/app/db/db_functions/sample_funtion.js'
    ),
    soilFunctions: () => resolvePath(
      path.resolve(__dirname, '../../../db/db_functions/soil_funtions.js'),
      '/app/db/db_functions/soil_funtions.js'
    ),
    userFunctions: () => resolvePath(
      path.resolve(__dirname, '../../../db/db_functions/user_functions.js'),
      '/app/db/db_functions/user_functions.js'
    ),
    logHandler: () => resolvePath(
      path.resolve(__dirname, '../../../db/log_files/log_handler.js'),
      '/app/db/log_files/log_handler.js'
    ),
  }
};
