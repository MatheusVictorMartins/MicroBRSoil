const path = require("path");
const R = require("r-integration");

async function runBarcodePipeline(fastqPath, barcodesPath, outputDir = null) {
  try {
    console.log('Starting Barcode demultiplexing pipeline...');
    console.log(`FASTQ Input: ${fastqPath}`);
    console.log(`Barcodes: ${barcodesPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    const barcodes = path.resolve(barcodesPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/dada2_pipeline_Daniel_edits.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        barcodes_path: barcodes,
        outdir: outputDir || "/app/results",
        type: "barcode"
      }
    );

    console.log('✅ Barcode pipeline completed successfully');
    return {
      success: true,
      type: 'barcode',
      inputFile: fastq,
      barcodesFile: barcodes,
      outputDir: outputDir,
      result: result
    };
  } catch (error) {
    console.error("❌ Error executing Barcode pipeline:", error);
    throw error;
  }
}

module.exports = runBarcodePipeline;
