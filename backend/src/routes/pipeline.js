const express = require("express");
const router = express.Router();
const { pipelines } = require('../utils/fakeDB');

// Use dynamic paths that work in both local development and Docker
const PIPELINE_FUNCTIONS_PATH = '/app/db/db_functions/pipeline_functions';

const { getPipelineRun, getPipelineRunsByUser, getPipelineResults } = require(PIPELINE_FUNCTIONS_PATH);

// Get pipeline run status
router.get('/status/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    // Try to get from database first
    const dbRun = await getPipelineRun(runId);
    if (dbRun) {
      return res.json({
        success: true,
        run: dbRun
      });
    }
    
    // Fallback to fakeDB
    const run = pipelines[runId];
    if (!run) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }
    
    res.json({ success: true, run });
  } catch (error) {
    console.error('Error getting pipeline status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pipeline results
router.get('/results/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const pipelineRun = await getPipelineRun(runId);
    if (!pipelineRun) {
      return res.status(404).json({ success: false, error: 'Pipeline run not found' });
    }
    
    if (pipelineRun.status !== 'completed') {
      return res.json({ 
        success: false, 
        error: 'Pipeline not completed yet',
        status: pipelineRun.status
      });
    }
    
    const results = await getPipelineResults(runId);
    
    res.json({
      success: true,
      run: pipelineRun,
      results: results
    });
  } catch (error) {
    console.error('Error getting pipeline results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's pipeline runs
router.get('/runs', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const runs = await getPipelineRunsByUser(userId);
    res.json({ success: true, runs });
  } catch (error) {
    console.error('Error getting user pipeline runs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Legacy routes (kept for compatibility)
const runIllumina = require("../integrations/run_illumina");
const runITS = require("../integrations/run_its");
const runBarcodePipeline = require("../integrations/index2"); 

router.post("/illumina", async (req, res) => {
  try {
    const { fastq1, fastq2 } = req.body;
    const result = await runIllumina(fastq1, fastq2);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/its", async (req, res) => {
  try {
    const { fastq1, fastq2 } = req.body;
    const result = await runITS(fastq1, fastq2);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/barcodes", async (req, res) => {
  try {
    const { fastqPath, barcodesPath } = req.body;

    if (!fastqPath || !barcodesPath) {
      return res.status(400).json({ success: false, error: "fastqPath e barcodesPath são obrigatórios." });
    }

    const result = await runBarcodePipeline(fastqPath, barcodesPath);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;