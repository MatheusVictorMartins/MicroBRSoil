/**
 * Module resolver for handling different paths in development vs Docker
 */

const path = require('path');
const fs = require('fs');

function resolvePath(localPath, dockerPath) {
  // Always use the docker path for consistency
  return dockerPath;
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
    db: () => '/app/db/db',
    pipelineFunctions: () => '/app/db/db_functions/pipeline_functions',
    resultProcessor: () => '/app/db/utilities/result_processor',
    alphaFunctions: () => '/app/db/db_functions/alpha_functions',
    sampleFunctions: () => '/app/db/db_functions/sample_funtion',
    soilFunctions: () => '/app/db/db_functions/soil_funtions',
  }
};
