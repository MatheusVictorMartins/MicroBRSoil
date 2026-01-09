const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { addPipelineJob } = require('../queues');
const { pipelines } = require('../utils/fakeDB');
const { v4: uuidv4 } = require('uuid');
const { paths } = require('../utils/moduleResolver');
const { requireAuth, requireAdmin, isAdminRole } = require('../middleware/authenticate');
const { PIPELINE_STATUS, RATE_LIMIT_MESSAGES } = require('../constants');
const { createRateLimiter } = require('../middleware/rateLimit');
const isProduction = process.env.NODE_ENV === 'production';

// Use dynamic paths that work in both local development and Docker
const { createPipelineRun, updatePipelineRunStatus, getPipelineRun } = require(paths.pipelineFunctions());
const DB_PATH = paths.db();

const router = express.Router();
router.use(requireAuth);

const uploadWriteLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: RATE_LIMIT_MESSAGES.UPLOADS
});

const uploadReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many upload file requests. Please slow down.'
});

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const allowedExtensions = [
  '.fastq',
  '.fastq.gz',
  '.fq',
  '.fq.gz',
  '.fa',
  '.fasta',
  '.zip',
  '.csv'
];

const multerLimits = {
  files: 50,
  fieldSize: 200 * 1024 * 1024,
  fieldNameSize: 100,
  fields: 1000
};

const sanitizeFilename = (name) => {
  const base = path.basename(name || '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned || `upload_${Date.now()}`;
};

const isAllowedExtension = (filename) => {
  const lower = filename.toLowerCase();
  return allowedExtensions.some((ext) => lower.endsWith(ext));
};

const fileFilter = (req, file, cb) => {
  const safeName = sanitizeFilename(file.originalname);
  file.originalname = safeName;

  if (!isAllowedExtension(safeName)) {
    const err = new Error('Invalid file type');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err);
  }

  cb(null, true);
};

const handleUploadError = (error, res) => {
  if (!error) return false;

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large.' });
      return true;
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      res.status(413).json({ error: 'Too many files. Maximum is 50 files.' });
      return true;
    }
    if (error.code === 'LIMIT_FIELD_VALUE') {
      res.status(413).json({ error: 'Field value too large.' });
      return true;
    }
    res.status(400).json({ error: 'Upload error: ' + error.message });
    return true;
  }

  if (error.code === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: 'Invalid file type. Allowed extensions: ' + allowedExtensions.join(', ') });
    return true;
  }

  res.status(500).json({ error: isProduction ? 'Upload failed' : 'Upload failed: ' + error.message });
  return true;
};

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
      const safeName = sanitizeFilename(file.originalname);
      cb(null, safeName);
    },
  });
};

// Common upload handler function
async function handleUpload(req, res, pipelineType) {
  try {
    const files = req.files || [req.file];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    // Sort files by originalname to ensure consistent order
    files.sort((a, b) => {
      return a.originalname.localeCompare(b.originalname, undefined, { numeric: true, sensitivity: 'base' });
    });

    const runId = req.uploadId;
    const userId = req.user?.id || null;
    
    // Create array of file info
    const uploadedFiles = files.map(file => ({
      name: file.originalname,
      path: file.path,
      size: file.size
    }));
    const uploadSizeBytes = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    req.logger?.info('Upload received', {
      run_id: runId,
      user_id: userId,
      pipeline_type: pipelineType,
      file_count: uploadedFiles.length,
      upload_size_bytes: uploadSizeBytes
    });

    // Determine input path based on pipeline type
    let mainFilePath;
    
    if (pipelineType === 'illumina') {
      // For Illumina: validate FASTQ files exist and use directory path
      // Support both patterns: *_R1_001.fastq.gz and *_L001_R1_001.fastq.gz
      const fastqFiles = uploadedFiles.filter(f => 
        f.name.match(/_(L\d{3}_)?R[12]_001\.fastq(\.gz)?$/i)
      );
      // Also accept alternate naming (R1/R2 or _1/_2) and zip
      const altFastqFiles = fastqFiles.length > 0 ? fastqFiles : uploadedFiles.filter(f =>
        f.name.match(/R[12].*\.fastq(\.gz)?$|_[12]\.fastq(\.gz)?$/i)
      );
      const zipFiles = uploadedFiles.filter(f => f.name.toLowerCase().endsWith('.zip'));
      
      if (altFastqFiles.length === 0 && zipFiles.length === 0) {
        // Clean up uploaded files
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        req.logger?.warn('Upload validation failed', {
          run_id: runId,
          user_id: userId,
          pipeline_type: pipelineType,
          reason: 'No valid FASTQ or ZIP found'
        });
        return res.status(400).json({ 
          error: 'No valid FASTQ or ZIP found. Illumina pipeline requires *_R1_001.fastq.gz/_L001_R1_001.fastq.gz, R1/R2 fastqs, or a ZIP containing them.',
          filesReceived: uploadedFiles.map(f => f.name)
        });
      }
      
      // Use the directory path containing FASTQ files, or the ZIP path (handled later)
      mainFilePath = altFastqFiles.length > 0 
        ? path.dirname(altFastqFiles[0].path)
        : zipFiles[0].path;
    } else if (pipelineType === 'iontorrent') {
      // IonTorrent: single multiplexed FASTQ + barcodes OR multiple demultiplexed FASTQs
      const fastqFiles = uploadedFiles
        .filter(f => f.name.match(/[.](fastq|fq)(\.gz)?$/i))
        .sort((a, b) => b.size - a.size);
      const barcodeFiles = uploadedFiles
        .filter(f => f.name.match(/[.]fa(sta)?$/i))
        .sort((a, b) => b.size - a.size);

      if (fastqFiles.length === 0) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        req.logger?.warn('Upload validation failed', {
          run_id: runId,
          user_id: userId,
          pipeline_type: pipelineType,
          reason: 'No FASTQ found for IonTorrent'
        });
        return res.status(400).json({
          error: 'No FASTQ found for IonTorrent. Please upload FASTQ (.fastq/.fq or .fastq.gz/.fq.gz).',
          filesReceived: uploadedFiles.map(f => f.name)
        });
      }

      const isDemultiplexed = fastqFiles.length > 1;

      if (!isDemultiplexed && barcodeFiles.length === 0) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        req.logger?.warn('Upload validation failed', {
          run_id: runId,
          user_id: userId,
          pipeline_type: pipelineType,
          reason: 'No barcode FASTA found for multiplexed input'
        });
        return res.status(400).json({
          error: 'Multiplexed IonTorrent requires a barcode FASTA (.fa or .fasta). Upload it in the barcode area.',
          filesReceived: uploadedFiles.map(f => f.name)
        });
      }

      // Basic sanity: reject extremely small single FASTQ that is likely not real reads
      if (!isDemultiplexed && fastqFiles[0].size < 1024) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        req.logger?.warn('Upload validation failed', {
          run_id: runId,
          user_id: userId,
          pipeline_type: pipelineType,
          reason: 'FASTQ too small'
        });
        return res.status(400).json({
          error: 'FASTQ is too small (<1KB). Please upload the real multiplexed FASTQ.',
          filesReceived: uploadedFiles.map(f => `${f.name} (${f.size} bytes)`)
        });
      }

      mainFilePath = isDemultiplexed
        ? path.dirname(fastqFiles[0].path)
        : fastqFiles[0].path;
      req.barcodesPath = barcodeFiles.length > 0 ? barcodeFiles[0].path : null;
    } else if (pipelineType === 'its') {
      // ITS expects paired FASTQs; pick directory containing *_R1_001/_R2_001
      const fastqFiles = uploadedFiles.filter(f =>
        f.name.match(/_(L\d{3}_)?R[12]_001\.fastq(\.gz)?$/i)
      );
      const r1Files = fastqFiles.filter(f => f.name.match(/_R1_001\.fastq(\.gz)?$/i));
      const r2Files = fastqFiles.filter(f => f.name.match(/_R2_001\.fastq(\.gz)?$/i));

      if (r1Files.length === 0 || r2Files.length === 0) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        req.logger?.warn('Upload validation failed', {
          run_id: runId,
          user_id: userId,
          pipeline_type: pipelineType,
          reason: 'Missing paired FASTQ files'
        });
        return res.status(400).json({
          error: 'ITS pipeline requires paired FASTQs matching *_R1_001.fastq.gz and *_R2_001.fastq.gz.',
          filesReceived: uploadedFiles.map(f => f.name)
        });
      }

      // Use the directory containing the FASTQs
      mainFilePath = path.dirname(r1Files[0].path);
    } else {
      // For other pipelines: use the first file path (legacy behavior)
      mainFilePath = files[0].path;
    }

    // Store in fakeDB for compatibility
    pipelines[runId] = {
      id: runId,
      status: PIPELINE_STATUS.QUEUED,
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
      inputFilePath: mainFilePath,
      uploadSizeBytes
    });

    const job = await addPipelineJob({
      runId,
      fastqPath: mainFilePath,
      pipelineType,
      meta: { 
        uploadedBy: userId || 'anonymous',
        allFiles: uploadedFiles,
        barcodesPath: req.barcodesPath || null
      },
    });

    pipelines[runId].jobId = job.id;

    // Update database with job ID
    const pool = require(DB_PATH);
    
    await updatePipelineRunStatus(runId, PIPELINE_STATUS.QUEUED);
    await pool.query(
      'UPDATE microbrsoil_db.pipeline_runs SET job_id = $1 WHERE run_id = $2',
      [job.id, runId]
    );

    req.logger?.info('Pipeline job queued', {
      run_id: runId,
      user_id: userId,
      job_id: job.id,
      pipeline_type: pipelineType,
      upload_size_bytes: uploadSizeBytes
    });

    return res.json({ 
      success: true,
      runId, 
      jobId: job.id,
      pipelineType,
      uploadPath: `uploads/${runId}`,
      filesUploaded: uploadedFiles.length,
      uploadSizeBytes,
      files: uploadedFiles,
      message: `${uploadedFiles.length} file(s) uploaded and ${pipelineType} pipeline job queued successfully`
    });
  } catch (err) {
    console.error(`${pipelineType} upload error`, err);
    req.logger?.error('Upload failed', {
      run_id: req.uploadId,
      user_id: req.user?.id || null,
      pipeline_type: pipelineType,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      error: `${pipelineType} upload failed`, 
      ...(isProduction ? {} : { details: err.message })
    });
  }
}

// Illumina endpoint
const illuminaUpload = multer({ 
  storage: createStorage('illumina'),
  limits: multerLimits,
  fileFilter
});
router.post('/illumina', uploadWriteLimiter, illuminaUpload.array('files'), (error, req, res, next) => {
  if (handleUploadError(error, res)) return;
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'illumina');
});

// IonTorrent endpoint  
const iontorrentUpload = multer({ 
  storage: createStorage('iontorrent'),
  limits: multerLimits,
  fileFilter
});
router.post('/iontorrent', uploadWriteLimiter, iontorrentUpload.array('files'), (error, req, res, next) => {
  if (handleUploadError(error, res)) return;
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'iontorrent');
});

// ITS endpoint
const itsUpload = multer({ 
  storage: createStorage('its'),
  limits: multerLimits,
  fileFilter
});
router.post('/its', uploadWriteLimiter, itsUpload.array('files'), (error, req, res, next) => {
  if (handleUploadError(error, res)) return;
  next();
}, async (req, res) => {
  await handleUpload(req, res, 'its');
});

// Legacy endpoint for backward compatibility
const legacyUpload = multer({ 
  storage: createStorage('default'),
  limits: multerLimits,
  fileFilter
});
router.post('/file', uploadWriteLimiter, legacyUpload.single('file'), (error, req, res, next) => {
  if (handleUploadError(error, res)) return;
  next();
}, async (req, res) => {
  const pipelineType = req.body.pipelineType || 'illumina';
  await handleUpload(req, res, pipelineType);
});

// List uploaded files for a run
router.get('/files/:runId', uploadReadLimiter, async (req, res) => {
  try {
    const { runId } = req.params;

    await ensureRunAccess(runId, req.user);
    const runUploadDir = path.join(UPLOADS_DIR, runId);
    
    if (!fs.existsSync(runUploadDir)) {
      return res.status(404).json({ error: 'Upload directory not found' });
    }
    
    const files = fs.readdirSync(runUploadDir)
      .filter(file => fs.statSync(path.join(runUploadDir, file)).isFile())
      .map(file => {
        const filePath = path.join(runUploadDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          downloadUrl: `/upload/download/${runId}/${file}`
        };
      });
    
    res.json({ files });
    
  } catch (error) {
    console.error('Error listing uploaded files:', error);
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    if (error.statusCode === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.status(500).json({ error: safeErrorMessage(error) });
  }
});

// Download uploaded files
router.get('/download/:runId/:filename', uploadReadLimiter, async (req, res) => {
  try {
    const { runId, filename } = req.params;

    await ensureRunAccess(runId, req.user);
    const filePath = path.join(UPLOADS_DIR, runId, filename);
    
    // Security check: ensure file is within the uploads directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedUploadDir = path.normalize(path.join(UPLOADS_DIR, runId));
    
    if (!normalizedFilePath.startsWith(normalizedUploadDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.fastq' || ext === '.fasta' || ext === '.fa') {
      contentType = 'text/plain';
    } else if (ext === '.gz') {
      contentType = 'application/gzip';
    } else if (ext === '.zip') {
      contentType = 'application/zip';
    }
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving uploaded file:', error);
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Pipeline run not found' });
    }
    if (error.statusCode === 403) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.status(500).json({ error: safeErrorMessage(error) });
  }
});

// Admin cleanup: delete all uploaded files from server storage
router.delete('/admin/cleanup', requireAdmin, uploadWriteLimiter, async (req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.json({ success: true, removed: 0, runsRemoved: 0 });
    }

    const entries = fs.readdirSync(UPLOADS_DIR);
    let removed = 0;
    entries.forEach((entry) => {
      const entryPath = path.join(UPLOADS_DIR, entry);
      fs.rmSync(entryPath, { recursive: true, force: true });
      removed += 1;
    });

    let runsRemoved = 0;
    try {
      const pool = require(DB_PATH);
      const statusesToPurge = [PIPELINE_STATUS.COMPLETED, PIPELINE_STATUS.FAILED];
      const result = await pool.query(
        'DELETE FROM microbrsoil_db.pipeline_runs WHERE status = ANY($1::text[]) RETURNING run_id',
        [statusesToPurge]
      );
      const removedRunIds = result.rows.map(row => row.run_id);
      removedRunIds.forEach((runId) => {
        if (pipelines[runId]) {
          delete pipelines[runId];
        }
      });
      runsRemoved = removedRunIds.length;
    } catch (cleanupError) {
      console.error('Pipeline runs cleanup error:', cleanupError);
    }

    return res.json({ success: true, removed, runsRemoved });
  } catch (error) {
    console.error('Upload cleanup error:', error);
    return res.status(500).json({ error: safeErrorMessage(error) });
  }
});

module.exports = router;

function canAccessRun(user, run) {
  if (!user || !run) return false;
  if (isAdminRole(user.role)) return true;
  const ownerId = run.user_id ?? run.userId;
  return ownerId !== undefined && String(ownerId) === String(user.id);
}

async function ensureRunAccess(runId, user) {
  const pipelineRun = await getPipelineRun(runId);
  if (pipelineRun) {
    if (!canAccessRun(user, pipelineRun)) {
      const err = new Error('Access denied');
      err.statusCode = 403;
      throw err;
    }
    return pipelineRun;
  }

  const fallbackRun = pipelines[runId];
  if (!fallbackRun) {
    const err = new Error('Pipeline run not found');
    err.statusCode = 404;
    throw err;
  }

  if (!canAccessRun(user, fallbackRun)) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  return fallbackRun;
}

function safeErrorMessage(err) {
  return isProduction ? 'Internal server error' : err.message;
}
