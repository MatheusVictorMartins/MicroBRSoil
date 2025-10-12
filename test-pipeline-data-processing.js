const { processPipelineResults } = require('./db/db_functions/pipeline_data_functions');
const path = require('path');

// Test function to validate pipeline data processing
async function testPipelineDataProcessing() {
    console.log('Testing pipeline data processing...');
    
    try {
        // Example test - you would use real data in production
        const testRunId = 'test-run-123';
        const testOutputDir = path.join(__dirname, 'test_results');
        const testPipelineType = 'illumina';
        const testUserId = 1;
        
        console.log(`Test parameters:`);
        console.log(`- Run ID: ${testRunId}`);
        console.log(`- Output Directory: ${testOutputDir}`);
        console.log(`- Pipeline Type: ${testPipelineType}`);
        console.log(`- User ID: ${testUserId}`);
        
        // Note: This would require actual CSV files and a status file to work
        // const result = await processPipelineResults(testRunId, testOutputDir, testPipelineType, testUserId);
        // console.log('✅ Test completed successfully:', result);
        
        console.log('⚠️ Test requires actual pipeline output files to run');
        console.log('Expected files in output directory:');
        console.log('- pipeline_status.json (with status: "success")');
        console.log('- alpha_diversity_metrics.csv');
        console.log('- otu_table.csv');
        console.log('- tax_table.csv');
        console.log('- sample_metadata.csv');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run test if called directly
if (require.main === module) {
    testPipelineDataProcessing();
}

module.exports = { testPipelineDataProcessing };