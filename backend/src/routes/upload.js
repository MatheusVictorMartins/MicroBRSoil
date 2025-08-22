const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { addPipelineJob } = require('../queues');
const { pipelines } = require('../utils/fakeDB');
const { v4: uuidv4 } = require('uuid');

// Use dynamic paths that work in both local development and Docker
const PIPELINE_FUNCTIONS_PATH = '/app/db/db_functions/pipeline_functions';

const DB_PATH = '/app/db/db';

const { createPipelineRun, updatePipelineRunStatus } = require(PIPELINE_FUNCTIONS_PATH);

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const runId = uuidv4();
    const filePath = path.join(UPLOADS_DIR, file.filename);
    const pipelineType = req.body.pipelineType || 'default';
    const userId = req.user?.id || null;

    // Store in fakeDB for compatibility
    pipelines[runId] = {
      id: runId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      file: file.filename,
      filePath,
      pipelineType,
      logs: [],
    };

    // Store in database
    await createPipelineRun({
      runId,
      userId,
      pipelineType,
      inputFilePath: filePath
    });

    const job = await addPipelineJob({
      runId,
      fastqPath: filePath,
      pipelineType,
      meta: { uploadedBy: userId || 'anonymous' },
    });

    pipelines[runId].jobId = job.id;

    // Update database with job ID
    const pool = require(DB_PATH);
    
    await updatePipelineRunStatus(runId, 'queued');
    await pool.query(
      'UPDATE microbrsoil_db.pipeline_runs SET job_id = $1 WHERE run_id = $2',
      [job.id, runId]
    );

    return res.json({ 
      success: true,
      runId, 
      jobId: job.id,
      message: 'File uploaded and pipeline job queued successfully'
    });
  } catch (err) {
    console.error('upload error', err);
    res.status(500).json({ error: 'upload failed', details: err.message });
  }
});

module.exports = router;