// Frontend Upload Examples for MicroBRSoil Pipeline Endpoints
// This file contains JavaScript examples for integrating with the upload endpoints

// =============================================================================
// 1. VANILLA JAVASCRIPT EXAMPLES
// =============================================================================

/**
 * Upload file to Illumina pipeline
 * @param {File} file - The FASTQ file to upload
 * @param {string} baseUrl - The API base URL (e.g., 'http://localhost:3000')
 * @returns {Promise<Object>} Upload response
 */
async function uploadToIllumina(file, baseUrl = 'http://localhost:3000') {
  const formData = new FormData();
  formData.append('fastq', file);

  try {
    const response = await fetch(`${baseUrl}/api/upload/illumina`, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type header - browser will set it with boundary
        'Authorization': `Bearer ${localStorage.getItem('token')}` // If auth is required
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Illumina upload failed:', error);
    throw error;
  }
}

/**
 * Upload file to IonTorrent pipeline
 * @param {File} file - The FASTQ file to upload
 * @param {string} baseUrl - The API base URL
 * @returns {Promise<Object>} Upload response
 */
async function uploadToIonTorrent(file, baseUrl = 'http://localhost:3000') {
  const formData = new FormData();
  formData.append('fastq', file);

  try {
    const response = await fetch(`${baseUrl}/api/upload/iontorrent`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('IonTorrent upload failed:', error);
    throw error;
  }
}

/**
 * Upload file to ITS pipeline
 * @param {File} file - The FASTQ file to upload
 * @param {string} baseUrl - The API base URL
 * @returns {Promise<Object>} Upload response
 */
async function uploadToITS(file, baseUrl = 'http://localhost:3000') {
  const formData = new FormData();
  formData.append('fastq', file);

  try {
    const response = await fetch(`${baseUrl}/api/upload/its`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('ITS upload failed:', error);
    throw error;
  }
}

// =============================================================================
// 2. GENERIC UPLOAD FUNCTION
// =============================================================================

/**
 * Generic upload function that supports all pipeline types
 * @param {File} file - The file to upload
 * @param {string} pipelineType - The pipeline type ('illumina', 'iontorrent', 'its')
 * @param {string} baseUrl - The API base URL
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} Upload response
 */
async function uploadToPipeline(file, pipelineType, baseUrl = 'http://localhost:3000', onProgress = null) {
  const formData = new FormData();
  formData.append('fastq', file);

  const endpoint = `${baseUrl}/api/upload/${pipelineType}`;

  try {
    // Create XMLHttpRequest for progress tracking
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`HTTP error! status: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('POST', endpoint);
        xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
        xhr.send(formData);
      });
    } else {
      // Use fetch for simple uploads
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    }
  } catch (error) {
    console.error(`${pipelineType} upload failed:`, error);
    throw error;
  }
}

// =============================================================================
// 3. HTML FORM INTEGRATION EXAMPLE
// =============================================================================

/**
 * Initialize upload form with drag and drop support
 */
function initializeUploadForm() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const pipelineSelect = document.getElementById('pipelineSelect');
  const uploadBtn = document.getElementById('uploadBtn');
  const progressBar = document.getElementById('progressBar');
  const statusDiv = document.getElementById('status');

  // Drag and drop events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      updateFileDisplay(files[0]);
    }
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      updateFileDisplay(e.target.files[0]);
    }
  });

  // Upload button click
  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const pipelineType = pipelineSelect.value;

    if (!file) {
      showStatus('Please select a file', 'error');
      return;
    }

    try {
      uploadBtn.disabled = true;
      showStatus('Uploading...', 'info');

      const result = await uploadToPipeline(file, pipelineType, 'http://localhost:3000', (progress) => {
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;
      });

      showStatus(`Upload successful! Run ID: ${result.runId}`, 'success');
      console.log('Upload result:', result);
      
    } catch (error) {
      showStatus(`Upload failed: ${error.message}`, 'error');
    } finally {
      uploadBtn.disabled = false;
      progressBar.style.width = '0%';
      progressBar.textContent = '';
    }
  });

  function updateFileDisplay(file) {
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// =============================================================================
// 4. REACT COMPONENT EXAMPLE
// =============================================================================

/**
 * React component for file upload
 */
const UploadComponent = () => {
  const [file, setFile] = React.useState(null);
  const [pipelineType, setPipelineType] = React.useState('illumina');
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError(null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const uploadResult = await uploadToPipeline(
        file, 
        pipelineType, 
        'http://localhost:3000',
        setProgress
      );
      
      setResult(uploadResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="upload-component">
      <h3>Upload FASTQ File</h3>
      
      <div>
        <label>Pipeline Type:</label>
        <select 
          value={pipelineType} 
          onChange={(e) => setPipelineType(e.target.value)}
          disabled={uploading}
        >
          <option value="illumina">Illumina</option>
          <option value="iontorrent">IonTorrent</option>
          <option value="its">ITS</option>
        </select>
      </div>

      <div>
        <label>FASTQ File:</label>
        <input 
          type="file" 
          accept=".fastq,.fq,.fastq.gz,.fq.gz" 
          onChange={handleFileChange}
          disabled={uploading}
        />
      </div>

      {file && (
        <div>
          <p>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
        </div>
      )}

      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{width: `${progress}%`}}
          >
            {Math.round(progress)}%
          </div>
        </div>
      )}

      {error && <div className="error">Error: {error}</div>}
      
      {result && (
        <div className="success">
          <h4>Upload Successful!</h4>
          <p>Run ID: {result.runId}</p>
          <p>Job ID: {result.jobId}</p>
          <p>Pipeline: {result.pipelineType}</p>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// 5. EXAMPLE HTML PAGE
// =============================================================================

const exampleHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MicroBRSoil Upload</title>
    <style>
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .drop-zone { 
            border: 2px dashed #ccc; 
            border-radius: 10px; 
            padding: 40px; 
            text-align: center; 
            margin: 20px 0;
            cursor: pointer;
        }
        .drop-zone.dragover { border-color: #007bff; background-color: #f8f9fa; }
        .progress-bar { 
            background-color: #f0f0f0; 
            border-radius: 5px; 
            overflow: hidden; 
            margin: 10px 0;
        }
        .progress-fill { 
            background-color: #007bff; 
            height: 20px; 
            text-align: center; 
            line-height: 20px; 
            color: white;
        }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .status.success { background-color: #d4edda; color: #155724; }
        .status.error { background-color: #f8d7da; color: #721c24; }
        .status.info { background-color: #d1ecf1; color: #0c5460; }
        button { padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:disabled { background-color: #ccc; cursor: not-allowed; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MicroBRSoil Pipeline Upload</h1>
        
        <div>
            <label for="pipelineSelect">Pipeline Type:</label>
            <select id="pipelineSelect">
                <option value="illumina">Illumina</option>
                <option value="iontorrent">IonTorrent</option>
                <option value="its">ITS</option>
            </select>
        </div>

        <div id="dropZone" class="drop-zone">
            <p>Drag and drop your FASTQ file here, or click to select</p>
            <input type="file" id="fileInput" accept=".fastq,.fq,.fastq.gz,.fq.gz" style="display: none;">
        </div>

        <div>
            <p>File: <span id="fileName">None selected</span></p>
            <p>Size: <span id="fileSize">-</span></p>
        </div>

        <button id="uploadBtn">Upload</button>

        <div class="progress-bar" style="display: none;">
            <div id="progressBar" class="progress-fill" style="width: 0%;"></div>
        </div>

        <div id="status" class="status" style="display: none;"></div>
    </div>

    <script>
        // Include the JavaScript functions from above
        // Then call initializeUploadForm()
        initializeUploadForm();
    </script>
</body>
</html>
`;

// =============================================================================
// 6. EXPORT FOR MODULE USAGE
// =============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    uploadToIllumina,
    uploadToIonTorrent,
    uploadToITS,
    uploadToPipeline,
    initializeUploadForm
  };
}