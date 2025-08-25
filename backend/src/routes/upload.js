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

// Helper function to create upload-specific directory
const createUploadDirectory = (uploadId) => {
  const uploadDir = path.join(UPLOADS_DIR, uploadId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Configure multer storage to use upload_id directory
const createStorage = (pipelineType) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadId = req.uploadId || uuidv4();
      req.uploadId = uploadId;
      const uploadDir = createUploadDirectory(uploadId);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Keep original filename for easier identification
      cb(null, file.originalname);
    },
  });
};

// Common upload handler function
async function handleUpload(req, res, pipelineType) {
  try {
    const files = req.files || [req.file];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const runId = req.uploadId;
    const userId = req.user?.id || null;
    
    // Create array of file info
    const uploadedFiles = files.map(file => ({
      name: file.originalname,
      path: file.path,
      size: file.size
    }));

    // Use the first file path as the main input path (for compatibility)
    const mainFilePath = files[0].path;

    // Store in fakeDB for compatibility
    pipelines[runId] = {
      id: runId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      files: uploadedFiles,
      filePath: mainFilePath, // Keep for backward compatibility
      pipelineType,
      logs: [],
    };

    // Store in database
    await createPipelineRun({
      runId,
      userId,
      pipelineType,
      inputFilePath: mainFilePath
    });

    const job = await addPipelineJob({
      runId,
      fastqPath: mainFilePath,
      pipelineType,
      meta: { 
        uploadedBy: userId || 'anonymous',
        allFiles: uploadedFiles
      },
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
      pipelineType,
      uploadPath: `uploads/${runId}`,
      filesUploaded: uploadedFiles.length,
      files: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded and ${pipelineType} pipeline job queued successfully`
    });
  } catch (err) {
    console.error(`${pipelineType} upload error`, err);
    res.status(500).json({ 
      error: `${pipelineType} upload failed`, 
      details: err.message 
    });
  }
}

// Illumina endpoint
const illuminaUpload = multer({ 
  storage: createStorage('illumina'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB per file
    files: 50, // Maximum 50 files (increased from 20)
    fieldSize: 100 * 1024 * 1024, // 100MB for field data
    fieldNameSize: 100, // Max field name size
    fieldSize: 100 * 1024 * 1024, // Max field value size
    fields: 1000 // Max number of non-file fields
  }
});
router.post('/illumina', illuminaUpload.array('files'), (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum file size is 2GB.' });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files. Maximum is 50 files.' });
    } else if (error.code === 'LIMIT_FIELD_VALUE') {
      return res.status(413).json({ error: 'Field value too large.' });
    } else {
      return res.status(400).json({ error: 'Upload error: ' + error.message });
    }
  } else if (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'illumina');
});

// IonTorrent endpoint  
const iontorrentUpload = multer({ 
  storage: createStorage('iontorrent'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB per file
    files: 50, // Maximum 50 files (increased from 20)
    fieldSize: 100 * 1024 * 1024, // 100MB for field data
    fieldNameSize: 100, // Max field name size
    fieldSize: 100 * 1024 * 1024, // Max field value size
    fields: 1000 // Max number of non-file fields
  }
});
router.post('/iontorrent', iontorrentUpload.array('files'), (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum file size is 2GB.' });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files. Maximum is 50 files.' });
    } else if (error.code === 'LIMIT_FIELD_VALUE') {
      return res.status(413).json({ error: 'Field value too large.' });
    } else {
      return res.status(400).json({ error: 'Upload error: ' + error.message });
    }
  } else if (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'iontorrent');
});

// ITS endpoint
const itsUpload = multer({ 
  storage: createStorage('its'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB per file
    files: 50, // Maximum 50 files (increased from 20)
    fieldSize: 100 * 1024 * 1024, // 100MB for field data
    fieldNameSize: 100, // Max field name size
    fieldSize: 100 * 1024 * 1024, // Max field value size
    fields: 1000 // Max number of non-file fields
  }
});
router.post('/its', itsUpload.array('files'), (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum file size is 2GB.' });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files. Maximum is 50 files.' });
    } else if (error.code === 'LIMIT_FIELD_VALUE') {
      return res.status(413).json({ error: 'Field value too large.' });
    } else {
      return res.status(400).json({ error: 'Upload error: ' + error.message });
    }
  } else if (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'its');
});

// Legacy endpoint for backward compatibility
const legacyUpload = multer({ 
  storage: createStorage('default'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB per file
    files: 50, // Maximum 50 files (increased from 20)
    fieldSize: 100 * 1024 * 1024, // 100MB for field data
    fieldNameSize: 100, // Max field name size
    fieldSize: 100 * 1024 * 1024, // Max field value size
    fields: 1000 // Max number of non-file fields
  }
});
router.post('/file', legacyUpload.single('file'), async (req, res) => {
  const pipelineType = req.body.pipelineType || 'illumina';
  await handleUpload(req, res, pipelineType);
});

module.exports = router;