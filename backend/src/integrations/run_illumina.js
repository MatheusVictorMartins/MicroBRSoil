const path = require("path");
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
      
      // Install additional packages on-demand for Illumina pipeline
      console.log('📦 Installing additional packages for Illumina pipeline...');
      await execAsync('Rscript -e "if (!require(phyloseq, quietly=TRUE)) BiocManager::install(\'phyloseq\', ask=FALSE, update=FALSE); if (!require(vegan, quietly=TRUE)) install.packages(\'vegan\'); if (!require(microbiome, quietly=TRUE)) install.packages(\'microbiome\')"', { timeout: 120000 });
      
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

async function runIlluminaPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting Illumina pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    // Check R packages before running pipeline
    await checkRPackages();

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/illumina.r";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_dada2_pipeline",
      {
        path1: fastq,
        path2: "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa",
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
