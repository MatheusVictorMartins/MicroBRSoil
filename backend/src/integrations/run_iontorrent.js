const path = require("path");
const fs = require("fs");
const R = require("r-integration");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

async function checkRPackages() {
  try {
    console.log('🔍 Quick R packages check...');
    
    // Check if core packages are available
    const { stdout, stderr } = await execAsync('Rscript -e "library(dada2); library(ggplot2); cat(\'CORE_OK\')" 2>/dev/null || echo "MISSING"', { timeout: 10000 });
    
    if (stdout.includes('CORE_OK')) {
      console.log('✅ Core R packages are ready');
      
      // Install additional packages on-demand for IonTorrent pipeline
      console.log('📦 Installing additional packages for IonTorrent pipeline...');
      await execAsync('Rscript -e "if (!require(phyloseq, quietly=TRUE)) BiocManager::install(\'phyloseq\', ask=FALSE, update=FALSE); if (!require(vegan, quietly=TRUE)) install.packages(\'vegan\'); if (!require(dplyr, quietly=TRUE)) install.packages(\'dplyr\'); if (!require(ShortRead, quietly=TRUE)) BiocManager::install(\'ShortRead\', ask=FALSE, update=FALSE)"', { timeout: 180000 });
      
      return true;
    } else {
      console.log('⚠️ Core packages not ready, will be handled by entrypoint');
      return true; // Let the entrypoint handle core installation
    }
  } catch (error) {
    console.log('⚠️ R packages check skipped (will be handled by entrypoint)');
    return true; // Don't fail the pipeline for this
  }
}

async function runIonTorrentPipeline(fastqPath, outputDir = null, barcodesPath = null) {
  try {
    console.log('Starting IonTorrent pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    let inputStats;
    try {
      inputStats = fs.statSync(fastqPath);
    } catch (err) {
      throw new Error(`IonTorrent input not found: ${fastqPath}`);
    }
    const inputIsDir = inputStats.isDirectory();
    if (!inputIsDir && !/\.f(ast)?q(\.gz)?$/i.test(fastqPath)) {
      throw new Error(`IonTorrent expects FASTQ input (.fastq/.fq). Received: ${fastqPath}`);
    }

    // Check R packages before running pipeline
    await checkRPackages();

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/iontorrent.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const defaultBarcodes = process.env.IONTORRENT_BARCODES_PATH || "/app/pipeline-r/barcodes/barcodes_16S.fa";
    const resolvedBarcodes = barcodesPath || (!inputIsDir ? defaultBarcodes : null);

    console.log(`Barcodes: ${resolvedBarcodes || 'none'}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        barcodes_path: resolvedBarcodes,
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
