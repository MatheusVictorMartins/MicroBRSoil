const path = require("path");
const R = require("r-integration");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

async function checkRPackages() {
  try {
    console.log('🔍 Quick R packages check...');
    const { stdout, stderr } = await execAsync('Rscript -e "library(dada2); cat(\'OK\')" 2>/dev/null || echo "MISSING"', { timeout: 5000 });
    if (stdout.includes('OK')) {
      console.log('✅ R packages are ready');
      return true;
    } else {
      console.log('⚠️ dada2 not immediately available, but will be handled by entrypoint');
      return true; // Let the entrypoint handle it
    }
  } catch (error) {
    console.log('⚠️ R packages check skipped (will be handled by entrypoint)');
    return true; // Don't fail the pipeline for this
  }
}

async function runIonTorrentPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting IonTorrent pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    // Check R packages before running pipeline
    await checkRPackages();

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/iontorrent.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        barcodes_path: "/app/pipeline-r/barcodes/barcodes_16S.fa",
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