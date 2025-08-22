const path = require("path");
const R = require("r-integration");

async function runITSPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting ITS pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/dada2_pipeline_ITS.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_pipeline_its",
      {
        path1: fastq,
        outdir: outputDir || "/app/results",
        type: "its"
      }
    );

    console.log('✅ ITS pipeline completed successfully');
    return {
      success: true,
      type: 'its',
      inputFile: fastq,
      outputDir: outputDir,
      result: result
    };
  } catch (error) {
    console.error("❌ Error executing ITS pipeline:", error);
    throw error;
  }
}

module.exports = runITSPipeline;