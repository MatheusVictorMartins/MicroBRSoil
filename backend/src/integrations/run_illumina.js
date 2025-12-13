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

    // Verify output files were created and validate quality
    if (outputDir) {
      const expectedFiles = [
        { name: 'otu_table.csv', minSize: 100, minRows: 1 },
        { name: 'tax_table.csv', minSize: 100, minRows: 1 },
        { name: 'sample_metadata.csv', minSize: 50, minRows: 1 },
        { name: 'phyloseq_object.rds', minSize: 500, minRows: null }
      ];
      
      const missingFiles = [];
      const invalidFiles = [];
      
      for (const fileSpec of expectedFiles) {
        const filePath = path.join(outputDir, fileSpec.name);
        
        if (!fs.existsSync(filePath)) {
          missingFiles.push(fileSpec.name);
          continue;
        }
        
        // Check file size
        const stats = fs.statSync(filePath);
        if (stats.size < fileSpec.minSize) {
          invalidFiles.push(`${fileSpec.name} (only ${stats.size} bytes, expected >${fileSpec.minSize})`);
          continue;
        }
        
        // For CSV files, validate row count
        if (fileSpec.minRows && fileSpec.name.endsWith('.csv')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.trim().split('\n');
            const dataRows = lines.length - 1; // Exclude header
            
            if (dataRows < fileSpec.minRows) {
              invalidFiles.push(`${fileSpec.name} (only ${dataRows} rows, expected >${fileSpec.minRows})`);
            }
          } catch (readError) {
            console.warn(`Could not validate ${fileSpec.name}: ${readError.message}`);
          }
        }
      }
      
      if (missingFiles.length > 0 || invalidFiles.length > 0) {
        const errorMsg = [];
        if (missingFiles.length > 0) {
          errorMsg.push(`Missing files: ${missingFiles.join(', ')}`);
        }
        if (invalidFiles.length > 0) {
          errorMsg.push(`Invalid/incomplete files: ${invalidFiles.join(', ')}`);
        }
        
        console.error(`\n❌ Pipeline output validation FAILED:\n  ${errorMsg.join('\n  ')}`);
        
        const validationError = new Error('Pipeline completed but output files are missing or invalid. This usually indicates the input FASTQ files were empty, corrupted, or the pipeline failed during processing.');
        validationError.missingFiles = missingFiles;
        validationError.invalidFiles = invalidFiles;
        throw validationError;
      }
      
      console.log('\n✅ All expected output files created and validated successfully');
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
