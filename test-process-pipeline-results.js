/**
 * Test script to manually process existing pipeline results
 * This simulates what the worker should do after a successful pipeline run
 * 
 * Run from backend container:
 * docker-compose exec backend-api node /app/test-process-pipeline-results.js
 */

const path = require('path');

// Use absolute paths from /app directory
const { processPipelineResults } = require('/app/db/utilities/result_processor');

async function testProcessResults() {
    // Use the most recent run with actual result files
    const runId = 'bac84b5d-f0f7-4c26-a688-785fee3f6b8b';
    const outputDirectory = '/app/results/' + runId;  // Container path
    const userId = 1; // Test user
    const pipelineType = 'illumina';

    console.log('πTesting Pipeline Results Processing');
    console.log('=====================================');
    console.log(`Run ID: ${runId}`);
    console.log(`Output Directory: ${outputDirectory}`);
    console.log(`Pipeline Type: ${pipelineType}`);
    console.log(`User ID: ${userId}`);
    console.log('');

    try {
        console.log('π Starting processing...\n');
        
        const result = await processPipelineResults(
            runId,
            outputDirectory,
            userId,
            pipelineType
        );

        console.log('\nβ SUCCESS! Results processed');
        console.log('=====================================');
        console.log('Result Summary:');
        console.log(JSON.stringify(result, null, 2));
        
        console.log('\nπ Database Records Created:');
        console.log(`- Soil ID: ${result.soilId}`);
        console.log(`- Pipeline Result ID: ${result.pipelineResultId}`);
        console.log(`- Alpha Diversity Records: ${result.processedRecords?.alphaRecords || 0}`);
        console.log(`- Sample/Taxonomy Records: ${result.processedRecords?.sampleRecords || 0}`);
        
    } catch (error) {
        console.error('\nβ ERROR during processing:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testProcessResults()
    .then(() => {
        console.log('\nβ Test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nβ Test failed:', error);
        process.exit(1);
    });
