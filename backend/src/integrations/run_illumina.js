const path = require("path");
const R = require("r-integration");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");

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
      await execAsync('Rscript -e "if (!require(phyloseq, quietly=TRUE)) BiocManager::install(\'phyloseq\', ask=FALSE, update=FALSE); if (!require(vegan, quietly=TRUE)) install.packages(\'vegan\', repos=\'https://cloud.r-project.org\'); if (!require(microbiome, quietly=TRUE)) install.packages(\'microbiome\', repos=\'https://cloud.r-project.org\'); if (!require(jsonlite, quietly=TRUE)) install.packages(\'jsonlite\', repos=\'https://cloud.r-project.org\')"', { timeout: 120000 });
      
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
  let scriptStartTime = Date.now();
  
  try {
    console.log('\n========================================');
    console.log('Starting Illumina Pipeline Execution');
    console.log('========================================');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Check R packages before running pipeline
    await checkRPackages();

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/illumina.r";

    console.log(`📜 R Script: ${scriptPath}`);
    console.log(`⏱️  Starting R execution at ${new Date().toISOString()}\n`);

    // Execute R script with improved error handling
    let rResult;
    try {
      rResult = await R.callMethod(
        scriptPath,
        "run_dada2_pipeline",
        {
          path1: fastq,
          path2: "/app/pipeline-r/references/silva_nr99_v138.1_train_set.fa",
          outdir: outputDir || "/app/results",
          type: "illumina"
        }
      );
      
      console.log(`\n⏱️  R execution completed at ${new Date().toISOString()}`);
      console.log(`⏱️  Total R execution time: ${((Date.now() - scriptStartTime) / 1000).toFixed(2)}s`);
      
    } catch (rError) {
      // Enhanced R error handling
      console.error('\n❌ R Script Execution Failed');
      console.error('========================================');
      console.error('Error details:');
      console.error('  Message:', rError.message);
      console.error('  Type:', rError.name);
      
      // Try to extract more meaningful error info
      if (rError.stderr) {
        console.error('  R stderr:', rError.stderr);
      }
      if (rError.stdout) {
        console.error('  R stdout:', rError.stdout);
      }
      
      // Check if status file was created (partial success)
      if (outputDir) {
        const statusFile = path.join(outputDir, 'pipeline_status.json');
        if (fs.existsSync(statusFile)) {
          try {
            const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            console.error('  Pipeline status:', status);
            
            if (status.status === 'partial_success') {
              console.log('\n⚠️  Pipeline completed with warnings/errors');
              console.log('Some outputs may still be available');
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      console.error('========================================\n');
      
      // Re-throw with enhanced message
      const enhancedError = new Error(
        `R pipeline execution failed: ${rError.message || 'Unknown error'}. ` +
        `Check logs for details. Common causes: insufficient overlap for merging, ` +
        `empty metadata, or over-filtering of reads.`
      );
      enhancedError.originalError = rError;
      enhancedError.exitCode = rError.code || 1;
      throw enhancedError;
    }

    // Verify output files were created
    if (outputDir) {
      const expectedFiles = [
        'otu_table.csv',
        'tax_table.csv',
        'sample_metadata.csv',
        'phyloseq_object.rds'
      ];
      
      const missingFiles = expectedFiles.filter(f => !fs.existsSync(path.join(outputDir, f)));
      
      if (missingFiles.length > 0) {
        console.warn(`\n⚠️  Warning: Some expected files were not created:`);
        missingFiles.forEach(f => console.warn(`  - ${f}`));
        console.warn('Pipeline may have completed with errors\n');
      } else {
        console.log('\n✅ All expected output files created successfully');
      }
    }

    console.log('\n========================================');
    console.log('Illumina Pipeline Completed Successfully');
    console.log('========================================\n');
    
    return {
      success: true,
      type: 'illumina',
      inputFile: fastq,
      outputDir: outputDir,
      result: rResult,
      executionTime: (Date.now() - scriptStartTime) / 1000
    };
    
  } catch (error) {
    console.error("\n❌ Error in Illumina pipeline wrapper:", error.message);
    
    // Add execution time to error
    error.executionTime = (Date.now() - scriptStartTime) / 1000;
    
    throw error;
  }
}

module.exports = runIlluminaPipeline;
