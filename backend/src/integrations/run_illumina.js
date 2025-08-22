const path = require("path");
const R = require("r-integration");

async function runIlluminaPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting Illumina pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/16silumina.r";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        outdir: outputDir || "/app/results",
        type: "illumina"
      }
    );

    console.log('✅ Illumina pipeline completed successfully');
    return {
      success: true,
      type: 'illumina',
      inputFile: fastq,
      outputDir: outputDir,
      result: result
    };
  } catch (error) {
    console.error("❌ Error executing Illumina pipeline:", error);
    throw error;
  }
}

module.exports = runIlluminaPipeline;
