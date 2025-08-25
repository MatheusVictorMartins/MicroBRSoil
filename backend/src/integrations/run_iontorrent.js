const path = require("path");
const R = require("r-integration");

async function runIonTorrentPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting IonTorrent pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/iontorrent.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        outdir: outputDir || "/app/results",
        type: "iontorrent"
      }
    );

    console.log('✅ IonTorrent pipeline completed successfully');
    return {
      success: true,
      type: 'iontorrent',
      inputFile: fastq,
      outputDir: outputDir,
      result: result
    };
  } catch (error) {
    console.error("❌ Error executing IonTorrent pipeline:", error);
    throw error;
  }
}

module.exports = runIonTorrentPipeline;