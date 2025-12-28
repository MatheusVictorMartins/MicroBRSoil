(() => {
const APP_CONSTANTS = window.APP_CONSTANTS || {};
const ROUTES = APP_CONSTANTS.ROUTES || {};
const MESSAGES = APP_CONSTANTS.MESSAGES || {};

const LOGIN_REQUIRED_MESSAGE = MESSAGES.LOGIN_REQUIRED_UPLOAD || "Log in or create an account to upload files and run pipelines.";
const UPLOAD_SUCCESS_MESSAGE = MESSAGES.UPLOAD_SUCCESS || "Upload sent successfully.";
const UPLOAD_ERROR_MESSAGE = MESSAGES.UPLOAD_ERROR || "Upload failed.";
const UPLOAD_STATE_KEY = "uploadDraftState";

    const analysis_select = document.getElementById("upload_select");
    const uploadArea = document.getElementById("unified-upload-area");
    const fileInput = document.getElementById("fileInput");
    const fileInput2 = document.getElementById("fileInput2");
    const fileDropZone = document.getElementById("fileDropZone");
    const fileDropZone2 = document.getElementById("file_drop_zone_2");
    const uploadForm = document.getElementById("unifiedUploadForm");
    const uploadBtn = document.getElementById("uploadBtn");
    const acceptedFileTypes = document.getElementById("acceptedFileTypes");
    const acceptedFileTypes2 = document.getElementById("acceptedFileTypes2");
    const uploadHelpText = document.getElementById("uploadHelpText");
    let authState = { authenticated: false, isAdmin: false, user: null };

    // Store files separately for each drop zone
    let zone1Files = [];
    let zone2Files = [];

    // Upload state management
    let currentUpload = {
      isUploading: false,
      progress: 0,
      selectedPipeline: null
    };

    const progressState = {
      target: 0,
      displayed: 0,
      rafId: null,
      startedAt: 0,
      minDisplayMs: 800,
      finalizing: false
    };

    function startProgressTracking() {
      progressState.target = 0;
      progressState.displayed = 0;
      progressState.startedAt = Date.now();
      progressState.finalizing = false;
      updateProgressUI(0, false);
    }

    function resetProgressTracking() {
      progressState.target = 0;
      progressState.displayed = 0;
      progressState.startedAt = 0;
      progressState.finalizing = false;
      if (progressState.rafId) {
        cancelAnimationFrame(progressState.rafId);
        progressState.rafId = null;
      }
      updateProgressUI(0, false);
    }

    function setProgressTarget(percent, isFinal = false) {
      const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
      progressState.finalizing = isFinal;
      progressState.target = isFinal ? 100 : Math.min(95, clamped);

      if (!progressState.rafId) {
        progressState.rafId = requestAnimationFrame(animateProgress);
      }
    }

    function finalizeProgress() {
      const elapsed = Date.now() - progressState.startedAt;
      const delay = Math.max(0, progressState.minDisplayMs - elapsed);
      setTimeout(() => {
        setProgressTarget(100, true);
      }, delay);
    }

    function animateProgress() {
      const diff = progressState.target - progressState.displayed;
      if (Math.abs(diff) < 0.2) {
        progressState.displayed = progressState.target;
      } else {
        progressState.displayed += diff * 0.2;
      }
      updateProgressUI(progressState.displayed, progressState.finalizing);

      if (progressState.displayed !== progressState.target) {
        progressState.rafId = requestAnimationFrame(animateProgress);
      } else {
        progressState.rafId = null;
      }
    }

    function updateProgressUI(percent, isFinalizing) {
      const progressBar = document.querySelector('.progress-bar');
      const progressText = document.querySelector('.progress-text');
      const rounded = Math.min(100, Math.max(0, Math.round(percent)));

      if (progressBar) {
        progressBar.style.width = `${rounded}%`;
      }
      if (progressText) {
        if (isFinalizing && rounded < 100) {
          progressText.textContent = 'Finalizing...';
        } else {
          progressText.textContent = `${rounded}%`;
        }
      }
    }

    function readUploadState() {
      try {
        const raw = localStorage.getItem(UPLOAD_STATE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (error) {
        return {};
      }
    }

    function writeUploadState(next) {
      try {
        const current = readUploadState();
        const merged = { ...current, ...next };
        localStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify(merged));
        return merged;
      } catch (error) {
        return null;
      }
    }

    function clearUploadState() {
      try {
        localStorage.removeItem(UPLOAD_STATE_KEY);
      } catch (error) {
        // ignore
      }
    }

    // Pipeline configurations
    const pipelineConfigs = {
      illumina: {
        accept1: ".fastq,.fq,.fastq.gz,.fa,.csv",
        accept2: "",
        helpText: "Select FASTQ files and metadata CSV for Illumina sequencing analysis",
        fileTypes: "FASTQ (.fastq, .fq, .fastq.gz), FASTA (.fa), CSV (.csv)",
        fileTypes2: "",
        endpoint: ROUTES.UPLOAD_ILLUMINA || "/upload/illumina",
        hasTwoZones: false,
        metadataRequired: true
      },
      iontorrent: {
        accept1: ".fastq,.fq,.fastq.gz,.csv",
        accept2: ".fa,.fasta",
        helpText: "Select FASTQ files, metadata CSV and BARCODE files for IonTorrent analysis",
        fileTypes: "FASTQ (.fastq, .fq, .fastq.gz), CSV (.csv)",
        fileTypes2: "BARCODES - FASTA (.fa, .fasta)",
        endpoint: ROUTES.UPLOAD_IONTORRENT || "/upload/iontorrent",
        hasTwoZones: true,
        metadataRequired: true
      },
      its: {
        accept1: ".fastq,.fq,.fastq.gz,.fa,.csv",
        accept2: "",
        helpText: "Select FASTQ files and metadata CSV for ITS analysis",
        fileTypes: "FASTQ (.fastq, .fq, .fastq.gz), FASTA (.fa), CSV (.csv)",
        fileTypes2: "",
        endpoint: ROUTES.UPLOAD_ITS || "/upload/its",
        hasTwoZones: false,
        metadataRequired: true
      }
    };

    const extensionGroups = {
      metadata: ['.csv'],
      fastq: ['.fastq', '.fastq.gz', '.fq', '.fq.gz'],
      fasta: ['.fa', '.fasta'],
      zip: ['.zip']
    };

    function parseAcceptList(acceptString) {
      if (!acceptString) return [];
      return acceptString
        .split(',')
        .map(ext => ext.trim().toLowerCase())
        .filter(Boolean);
    }

    function fileHasExtension(filename, extensions) {
      const name = String(filename || '').toLowerCase();
      return extensions.some(ext => name.endsWith(ext));
    }

    function isAllowedFile(filename, allowedExtensions) {
      if (!allowedExtensions || allowedExtensions.length === 0) return true;
      return allowedExtensions.some(ext => String(filename || '').toLowerCase().endsWith(ext));
    }

    function summarizeList(items, limit = 4) {
      const list = Array.from(items);
      if (list.length <= limit) return list.join(', ');
      return `${list.slice(0, limit).join(', ')} +${list.length - limit} more`;
    }

    function validateSelection() {
      const config = pipelineConfigs[currentUpload.selectedPipeline];
      const result = {
        errors: [],
        warnings: [],
        invalidZone1: new Set(),
        invalidZone2: new Set(),
        hasMetadata: false,
        hasBarcode: false,
        hasFiles: false
      };

      if (!config) return result;

      const allowedZone1 = parseAcceptList(config.accept1);
      const allowedZone2 = parseAcceptList(config.accept2);
      const hasAnyFiles = zone1Files.length > 0 || zone2Files.length > 0;
      if (!hasAnyFiles) return result;

      zone1Files.forEach(file => {
        result.hasFiles = true;
        if (!isAllowedFile(file.name, allowedZone1)) {
          result.invalidZone1.add(file.name);
        }
        if (fileHasExtension(file.name, extensionGroups.metadata)) {
          result.hasMetadata = true;
        }
      });

      zone2Files.forEach(file => {
        result.hasFiles = true;
        if (!isAllowedFile(file.name, allowedZone2)) {
          result.invalidZone2.add(file.name);
        }
        if (fileHasExtension(file.name, extensionGroups.fasta)) {
          result.hasBarcode = true;
        }
      });

      if (result.invalidZone1.size) {
        result.errors.push(`Unsupported file type in main upload: ${summarizeList(result.invalidZone1)}.`);
      }
      if (result.invalidZone2.size) {
        result.errors.push(`Unsupported file type in barcode area: ${summarizeList(result.invalidZone2)}.`);
      }

      const hasNonMetadata = zone1Files.some(file => !fileHasExtension(file.name, extensionGroups.metadata)) || zone2Files.length > 0;
      if (config.metadataRequired && hasNonMetadata && !result.hasMetadata) {
        result.errors.push('Metadata CSV (.csv) is required. Please add a metadata file.');
      }

      if (config.hasTwoZones && zone1Files.length > 0 && zone2Files.length === 0) {
        result.errors.push('Barcode files are required for IonTorrent (.fa or .fasta) in the barcode area.');
      } else if (config.hasTwoZones && zone2Files.length > 0 && !result.hasBarcode) {
        result.errors.push('Barcode area must include .fa or .fasta files.');
      }

      return result;
    }

    function renderValidationStatus(validation) {
      if (currentUpload.isUploading) return;
      if (!validation || !validation.hasFiles) {
        showStatus('', '');
        return;
      }
      if (validation.errors.length) {
        showStatus(validation.errors.join(' '), 'error');
      } else if (validation.warnings.length) {
        showStatus(validation.warnings.join(' '), 'warning');
      } else {
        showStatus('', '');
      }
    }

    async function refreshAuthState(forceRefresh = false) {
      try {
        const status = await getAuthStatus(forceRefresh);
        status.isAdmin = status.isAdmin ?? isAdminRole(status.user?.role);
        authState = status;
        return status;
      } catch (error) {
        authState = { authenticated: false, isAdmin: false, user: null };
        return authState;
      }
    }

    function redirectToLoginWithReturn() {
      const nextParam = encodeURIComponent(window.location.pathname + window.location.search);
      const loginRoute = ROUTES.AUTH_LOGIN || "/login";
      window.location.href = `${loginRoute}?next=${nextParam}`;
    }

    async function ensureAuthenticatedForUpload(event) {
      const status = await refreshAuthState(true);
      if (status.authenticated) return true;

      if (event) event.preventDefault();
      showStatus(LOGIN_REQUIRED_MESSAGE, "error");
      setTimeout(() => redirectToLoginWithReturn(), 800);
      return false;
    }

    function handlePipelineSelection() {
      const selectedPipeline = analysis_select.value;
      
      if (!selectedPipeline || selectedPipeline === "Select an analysis...") {
        uploadArea.style.display = "none";
        currentUpload.selectedPipeline = null;
        writeUploadState({ selectedPipeline: null });
        return;
      }

      const config = pipelineConfigs[selectedPipeline];
      if (!config) return;

      // Update pipeline selection
      currentUpload.selectedPipeline = selectedPipeline;
      writeUploadState({ selectedPipeline });
      
      // Update UI elements
      fileInput.accept = config.accept1;
      fileInput2.accept = config.accept2;
      acceptedFileTypes.textContent = config.fileTypes;
      acceptedFileTypes2.textContent = config.fileTypes2;
      uploadHelpText.textContent = config.helpText;
      uploadBtn.innerHTML = `<span class="material-symbols-rounded">upload</span> Upload ${selectedPipeline.toUpperCase()}`;
      
      // Show upload area
      uploadArea.style.display = "flex";
      console.log(selectedPipeline);
      
      // Show/hide second drop zone based on pipeline
      if (config.hasTwoZones) {
        fileDropZone2.style.display = "flex";
      } else {
        fileDropZone2.style.display = "none";
      }
      
      // Reset form
      resetForm();
    }

    function resetForm(options = {}) {
      const { keepStatus = false, keepProgress = false } = options;
      fileInput.value = "";
      fileInput2.value = "";
      zone1Files = [];
      zone2Files = [];
      document.getElementById("selectedFiles").innerHTML = "";
      uploadBtn.disabled = true;
      if (!keepStatus) {
        showStatus("", "");
      }
      if (!keepProgress) {
        showProgress(false);
      }
    }

    // Drag and drop functionality
    function initializeDragAndDrop() {
      // Prevent defaults for both zones
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, preventDefaults, false);
        fileDropZone2.addEventListener(eventName, preventDefaults, false);
      });

      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Zone 1 drag styling
      ['dragenter', 'dragover'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, () => {
          fileDropZone.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        fileDropZone.addEventListener(eventName, () => {
          fileDropZone.classList.remove('drag-active');
        }, false);
      });

      // Zone 2 drag styling
      ['dragenter', 'dragover'].forEach(eventName => {
        fileDropZone2.addEventListener(eventName, () => {
          fileDropZone2.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        fileDropZone2.addEventListener(eventName, () => {
          fileDropZone2.classList.remove('drag-active');
        }, false);
      });

      // Zone 1 drop and click handlers
      fileDropZone.addEventListener('drop', (e) => handleDrop(e, 1), false);
      fileDropZone.addEventListener('click', () => fileInput.click());

      // Zone 2 drop and click handlers
      fileDropZone2.addEventListener('drop', (e) => handleDrop(e, 2), false);
      fileDropZone2.addEventListener('click', () => fileInput2.click());
    }

    function handleDrop(e, zoneNumber) {
      const dt = e.dataTransfer;
      const files = Array.from(dt.files);
      
      if (zoneNumber === 1) {
        zone1Files = files;
      } else {
        zone2Files = files;
      }
      
      refreshSelectionUI();
    }

    function handleFileSelection(zoneNumber) {
      if (zoneNumber === 1) {
        zone1Files = Array.from(fileInput.files);
      } else {
        zone2Files = Array.from(fileInput2.files);
      }
      
      refreshSelectionUI();
    }

    function refreshSelectionUI() {
      const validation = validateSelection();
      updateFileDisplay(validation);
      updateUploadButton(validation);
      renderValidationStatus(validation);
    }

    function updateUploadButton(validation) {
      const config = pipelineConfigs[currentUpload.selectedPipeline];
      if (!config) {
        uploadBtn.disabled = true;
        return;
      }

      const hasRequiredFiles = config.hasTwoZones
        ? zone1Files.length > 0 && zone2Files.length > 0
        : zone1Files.length > 0;
      const hasMetadata = !config.metadataRequired || validation?.hasMetadata;
      const hasNoErrors = !validation || validation.errors.length === 0;

      uploadBtn.disabled = !hasRequiredFiles || !hasMetadata || !hasNoErrors;
    }

    function updateFileDisplay(validation) {
      const selectedFilesDiv = document.getElementById('selectedFiles');
      const config = pipelineConfigs[currentUpload.selectedPipeline];
      const invalidZone1 = validation?.invalidZone1 || new Set();
      const invalidZone2 = validation?.invalidZone2 || new Set();

      if (!config) {
        selectedFilesDiv.innerHTML = '';
        return;
      }
      
      if (zone1Files.length === 0 && zone2Files.length === 0) {
        selectedFilesDiv.innerHTML = '';
        return;
      }
      
      let html = '<div class="mt-3">';
      
      // Zone 1 files
      if (zone1Files.length > 0) {
        const sortedZone1 = zone1Files.sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        html += `<div class="mb-3">
          <strong><span class="material-symbols-rounded" style="vertical-align: middle;">description</span> ${config.fileTypes}:</strong>
          <ul class="list-group mt-2">`;
        
        for (const file of sortedZone1) {
          const size = formatFileSize(file.size);
          const icon = getFileIcon(file.name);
          const isInvalid = invalidZone1.has(file.name);
          const itemClass = isInvalid ? 'list-group-item list-group-item-danger' : 'list-group-item';
          const badges = isInvalid
            ? `<span class="badge bg-danger me-2">Invalid type</span><span class="badge bg-secondary">${size}</span>`
            : `<span class="badge bg-primary">${size}</span>`;
          html += `<li class="${itemClass} d-flex justify-content-between align-items-center">
                     <span><span class="material-symbols-rounded file-icon">${icon}</span> ${file.name}</span>
                     <span>${badges}</span>
                   </li>`;
        }
        html += '</ul></div>';
      }
      
      // Zone 2 files (only for IonTorrent)
      if (config.hasTwoZones && zone2Files.length > 0) {
        const sortedZone2 = zone2Files.sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        html += `<div class="mb-3">
          <strong><span class="material-symbols-rounded" style="vertical-align: middle;">code</span> ${config.fileTypes2}:</strong>
          <ul class="list-group mt-2">`;
        
        for (const file of sortedZone2) {
          const size = formatFileSize(file.size);
          const icon = getFileIcon(file.name);
          const isInvalid = invalidZone2.has(file.name);
          const itemClass = isInvalid ? 'list-group-item list-group-item-danger' : 'list-group-item';
          const badges = isInvalid
            ? `<span class="badge bg-danger me-2">Invalid type</span><span class="badge bg-secondary">${size}</span>`
            : `<span class="badge bg-success">${size}</span>`;
          html += `<li class="${itemClass} d-flex justify-content-between align-items-center">
                     <span><span class="material-symbols-rounded file-icon">${icon}</span> ${file.name}</span>
                     <span>${badges}</span>
                   </li>`;
        }
        html += '</ul></div>';
      }
      
      html += '</div>';
      selectedFilesDiv.innerHTML = html;
    }

    function getFileIcon(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      switch(ext) {
        case 'fastq':
        case 'fq':
          return 'description';
        case 'gz':
          return 'folder_zip';
        case 'fa':
        case 'fasta':
          return 'code';
        default:
          return 'insert_drive_file';
      }
    }

    // Upload handler function
    async function handleUpload(event) {
      event.preventDefault();
      
      const allowed = await ensureAuthenticatedForUpload(event);
      if (!allowed) return;

      if (currentUpload.isUploading || !currentUpload.selectedPipeline) return;

      const config = pipelineConfigs[currentUpload.selectedPipeline];
      if (!config) {
        showStatus('Invalid analysis type', 'error');
        return;
      }

      const validation = validateSelection();
      if (validation.errors.length) {
        showStatus(validation.errors.join(' '), 'error');
        return;
      }

      // Validate files based on pipeline type
      if (config.hasTwoZones) {
        if (zone1Files.length === 0 || zone2Files.length === 0) {
          showStatus('Please select files for both FASTQ and BARCODE areas', 'error');
          return;
        }
      } else {
        if (zone1Files.length === 0) {
          showStatus('Please select at least one file', 'error');
          return;
        }
      }

      const formData = new FormData();
      
      // Combine all files from both zones
      const allFiles = [...zone1Files, ...zone2Files];
      
      // Sort all files by filename
      const sortedFiles = allFiles.sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      
      // Add all files to FormData
      for (const file of sortedFiles) {
        formData.append('files', file);
      }

      try {
        currentUpload.isUploading = true;
        writeUploadState({
          isUploading: true,
          progressPercent: 0,
          startedAt: Date.now(),
          selectedPipeline: currentUpload.selectedPipeline
        });
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';

        showProgress(true);
        showStatus(`Sending ${allFiles.length} file(s)...`, 'info');

        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        
        // Progress tracking
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            updateProgress(percentComplete);
          }
        });

        // Upload completion
        let shouldResetForm = false;
        let shouldHideProgress = false;

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let result = {};
            try {
              result = JSON.parse(xhr.responseText);
            } catch (e) {
              result = {};
            }
            const filesUploaded = Number(result.filesUploaded) || allFiles.length;
            const messageParts = [
              UPLOAD_SUCCESS_MESSAGE,
              `${filesUploaded} file(s) uploaded.`
            ];
            if (result.runId) {
              messageParts.push(`ID: ${result.runId}.`);
            }
            messageParts.push('Pipeline queued for processing.');
            const baseMessage = messageParts.join(' ');
            showStatus(baseMessage, 'success');
            showToast('Attachments sent successfully. Pipeline queued.', 'success');
            console.log('Upload result:', result);

            try {
              localStorage.setItem('lastPipelineRun', JSON.stringify({ runId: result.runId }));
            } catch (e) {
              // ignore storage errors
            }

            annotateQueueStatus(result.runId, baseMessage);
            finalizeProgress();
            writeUploadState({
              isUploading: false,
              progressPercent: 100,
              completedAt: Date.now()
            });
            shouldResetForm = true;
            shouldHideProgress = true;

            // Reset form
            resetForm({ keepStatus: true, keepProgress: true });
          } else {
            let error = {};
            try {
              error = JSON.parse(xhr.responseText);
            } catch (e) {
              error = {};
            }
            showStatus(`Upload error: ${error.error || 'Unknown error'}`, 'error');
            writeUploadState({ isUploading: false });
            shouldHideProgress = true;
          }
        });

        // Error handling
        xhr.addEventListener('error', () => {
          showStatus('Connection error during upload', 'error');
          writeUploadState({ isUploading: false });
          shouldHideProgress = true;
        });

        xhr.addEventListener('loadend', () => {
          currentUpload.isUploading = false;
          uploadBtn.innerHTML = `<span class="material-symbols-rounded">upload</span> Upload ${currentUpload.selectedPipeline.toUpperCase()}`;
          updateUploadButton(validateSelection());

          if (shouldHideProgress) {
            const hideDelay = shouldResetForm ? 1200 : 600;
            setTimeout(() => {
              if (!currentUpload.isUploading) {
                showProgress(false);
              }
            }, hideDelay);
          }
        });

        // Send request
        xhr.open('POST', config.endpoint);
        
        // Add auth header if token exists
        const token = localStorage.getItem('token');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        
        xhr.send(formData);

      } catch (error) {
        console.error('Upload error:', error);
        showStatus(`${UPLOAD_ERROR_MESSAGE} ${error.message}`, 'error');
        currentUpload.isUploading = false;
        uploadBtn.innerHTML = `<span class="material-symbols-rounded">upload</span> Upload ${currentUpload.selectedPipeline.toUpperCase()}`;
        updateUploadButton(validateSelection());
        showProgress(false);
      }
    }

    // Helper functions
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showProgress(show) {
      const progressDiv = document.getElementById('uploadProgress');
      if (progressDiv) {
        progressDiv.style.display = show ? 'block' : 'none';
      }
      if (show) {
        startProgressTracking();
      } else {
        resetProgressTracking();
      }
    }

    function updateProgress(percent) {
      setProgressTarget(percent, false);
      writeUploadState({ progressPercent: Math.round(percent) });
    }

    function showStatus(message, type) {
      const statusDiv = document.getElementById('uploadStatus');
      if (statusDiv) {
        const classMap = {
          success: 'text-success',
          error: 'text-danger',
          warning: 'text-warning',
          info: 'text-info'
        };
        statusDiv.textContent = message || '';
        statusDiv.className = `upload-status ${classMap[type] || ''}`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
          setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'upload-status';
          }, 5000);
        }
      }
    }

    function showToast(message, variant = 'success') {
      const toastEl = document.getElementById('uploadToast');
      const toastBody = document.getElementById('uploadToastBody');
      if (!toastEl || !toastBody || typeof bootstrap === 'undefined') return;

      toastEl.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning', 'text-bg-info');
      toastEl.classList.add(`text-bg-${variant}`);
      toastBody.textContent = message;

      const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 });
      toast.show();
    }

    async function annotateQueueStatus(runId, baseMessage) {
      if (!runId) return;
      try {
        const statusRoute = ROUTES.PIPELINE_STATUS || "/pipeline/status";
        const response = await fetch(`${statusRoute}/${runId}`);
        if (!response.ok) return;
        const data = await response.json();
        const queueInfo = data.queue;
        if (!queueInfo || !queueInfo.state) return;

        const hasPosition = Number.isInteger(queueInfo.position) && queueInfo.position >= 0;
        const positionText = hasPosition ? ` (position ${queueInfo.position + 1})` : '';
        showStatus(`${baseMessage} Queue: ${queueInfo.state}${positionText}.`, 'success');
      } catch (error) {
        // ignore queue status errors
      }
    }

    function restoreUploadState() {
      const state = readUploadState();
      const savedPipeline = state.selectedPipeline;
      if (savedPipeline && analysis_select) {
        analysis_select.value = savedPipeline;
        handlePipelineSelection();
      }

      if (state.isUploading) {
        const percent = Number(state.progressPercent) || 0;
        showProgress(true);
        setProgressTarget(percent, false);
        showStatus('Upload interrupted by refresh. Please reselect files to restart.', 'warning');
        writeUploadState({ isUploading: false });
      }
    }

    // Initialize
    analysis_select.addEventListener("change", handlePipelineSelection);
    fileInput.addEventListener("change", () => handleFileSelection(1));
    fileInput2.addEventListener("change", () => handleFileSelection(2));
    uploadForm.addEventListener("submit", handleUpload);
    
    // Initialize drag and drop
    initializeDragAndDrop();
    restoreUploadState();
})();
