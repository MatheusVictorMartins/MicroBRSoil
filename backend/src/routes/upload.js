const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { addPipelineJob } = require('../queues');
const { pipelines } = require('../utils/fakeDB');
const { v4: uuidv4 } = require('uuid');
const { paths } = require('../utils/moduleResolver');
const { requireAuth } = require('../middleware/authenticate');

// Use dynamic paths that work in both local development and Docker
const { createPipelineRun, updatePipelineRunStatus } = require(paths.pipelineFunctions());
const DB_PATH = paths.db();

const router = express.Router();
router.use(requireAuth);

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
      // IonTorrent expects a multiplexed FASTQ; ignore barcode fasta when choosing the main file
      const fastqFiles = uploadedFiles
        .filter(f => f.name.match(/[.]fastq(\.gz)?$/i))
        .sort((a, b) => b.size - a.size); // pick the largest FASTQ

      if (fastqFiles.length === 0) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        return res.status(400).json({
          error: 'No FASTQ found for IonTorrent. Please upload the multiplexed FASTQ (.fastq or .fastq.gz).',
          filesReceived: uploadedFiles.map(f => f.name)
        });
      }

      // Basic sanity: reject extremely small files that are likely not real reads
      if (fastqFiles[0].size < 1024) {
        const uploadDir = path.dirname(files[0].path);
        fs.rmSync(uploadDir, { recursive: true, force: true });
        return res.status(400).json({
          error: 'FASTQ is too small (<1KB). Please upload the real multiplexed FASTQ.',
          filesReceived: uploadedFiles.map(f => `${f.name} (${f.size} bytes)`)
        });
      }

      mainFilePath = fastqFiles[0].path;
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
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB per file
    files: 50, // Maximum 50 files
    fieldSize: 200 * 1024 * 1024, // 200MB for field data
    fieldNameSize: 100, // Max field name size
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
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB per file
    files: 50, // Maximum 50 files
    fieldSize: 200 * 1024 * 1024, // 200MB for field data
    fieldNameSize: 100, // Max field name size
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
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB per file
    files: 50, // Maximum 50 files
    fieldSize: 200 * 1024 * 1024, // 200MB for field data
    fieldNameSize: 100, // Max field name size
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
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB per file
    files: 50, // Maximum 50 files
    fieldSize: 200 * 1024 * 1024, // 200MB for field data
    fieldNameSize: 100, // Max field name size
    fields: 1000 // Max number of non-file fields
  }
});
router.post('/file', legacyUpload.single('file'), async (req, res) => {
  const pipelineType = req.body.pipelineType || 'illumina';
  await handleUpload(req, res, pipelineType);
});

// List uploaded files for a run
router.get('/files/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download uploaded files
router.get('/download/:runId/:filename', async (req, res) => {
  try {
    const { runId, filename } = req.params;
    
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
