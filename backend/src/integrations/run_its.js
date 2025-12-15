const path = require("path");
const fs = require("fs");
const os = require("os");
const R = require("r-integration");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

function detectMemoryLimitBytes() {
  const candidates = [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes"
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8").trim();
      if (!raw || raw === "max") continue;
      const val = parseInt(raw, 10);
      if (Number.isFinite(val) && val > 0 && val < Number.MAX_SAFE_INTEGER) {
        return val;
      }
    } catch (err) {
      // Ignore and try next candidate
    }
  }
  return null;
}

function configureRMemoryEnv() {
  const hostTotal = os.totalmem();
  const cgroupLimit = detectMemoryLimitBytes();
  const limitBytes = cgroupLimit ? Math.min(hostTotal, cgroupLimit) : hostTotal;
  const targetBytes = Math.max(Math.floor(limitBytes * 0.9), 2 * 1024 ** 3);
  const targetGB = Math.max(2, Math.floor(targetBytes / (1024 ** 3)));

  process.env.R_MAX_VSIZE = `${targetGB}G`;
  process.env.R_MAX_MEM_SIZE = `${targetGB}G`;
  process.env.MALLOC_ARENA_MAX = process.env.MALLOC_ARENA_MAX || "2";

  console.log(
    `?? R memory ceiling set to ~${targetGB}G (source=${cgroupLimit ? "cgroup" : "host"})`
  );
}

async function checkRPackages() {
  try {
    console.log('🔍 Quick R packages check...');
    
    // Check if core packages are available
    const { stdout, stderr } = await execAsync('Rscript -e "library(dada2); library(ggplot2); cat(\'CORE_OK\')" 2>/dev/null || echo "MISSING"', { timeout: 10000 });
    
    if (stdout.includes('CORE_OK')) {
      console.log('✅ Core R packages are ready');
      
      // Install additional packages on-demand for ITS pipeline
      console.log('📦 Installing additional packages for ITS pipeline...');
      await execAsync('Rscript -e "if (!require(phyloseq, quietly=TRUE)) BiocManager::install(\'phyloseq\', ask=FALSE, update=FALSE); if (!require(vegan, quietly=TRUE)) install.packages(\'vegan\')"', { timeout: 120000 });
      
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

async function runITSPipeline(fastqPath, outputDir = null) {
  try {
    console.log('Starting ITS pipeline...');
    console.log(`Input: ${fastqPath}`);
    console.log(`Output: ${outputDir || 'default'}`);

    // Allow R to see the full memory available to the container/host
    configureRMemoryEnv();

    // Check R packages before running pipeline
    await checkRPackages();

    const fastq = path.resolve(fastqPath).replace(/\\/g, "/");
    
    // Use Docker path for R script
    const scriptPath = "/app/pipeline-r/pipeline/its.R";

    console.log(`📜 R Script: ${scriptPath}`);

    const result = await R.callMethod(
      scriptPath,
      "run_pipeline_its",
      {
        path1: fastq,
        path2: "/app/pipeline-r/references/sh_general_release_dynamic_19.02.2025.fasta",
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
