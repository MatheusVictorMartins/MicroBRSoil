(() => {
const APP_CONSTANTS = window.APP_CONSTANTS || {};
const ROUTES = APP_CONSTANTS.ROUTES || {};
const TABLE_BASE = ROUTES.TABLE_BASE || "/api/table";
const RESULTS_FILES_ROUTE = ROUTES.RESULTS_FILES || "/results/files";
const RESULTS_DOWNLOAD_ROUTE = ROUTES.RESULTS_DOWNLOAD || "/results/download";
const UPLOAD_FILES_ROUTE = ROUTES.UPLOAD_FILES || "/upload/files";
const UPLOAD_DOWNLOAD_ROUTE = ROUTES.UPLOAD_DOWNLOAD || "/upload/download";
const PIPELINE_STATUS_ROUTE = ROUTES.PIPELINE_STATUS || "/pipeline/status";

// Helper: read soilId from query string or hash
    function getSoilId() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('soilId') || params.get('id') || null;
      return id ? id : null;
    }

    let pipelineRunsCache = [];
    const runLogsCache = new Map();
    const runRuntimeCache = new Map();
    let currentResultsRunId = null;
    let currentOtuSummary = null;
    let currentTaxaSummary = null;
    let currentTotalReads = null;
    const runCsvCache = new Map();
    const runTextCache = new Map();
    let lazyObserver = null;
    const lazyLoaders = new Map();

    function resetResultsCaches(runId) {
      const key = String(runId || '');
      if (currentResultsRunId === key) return;
      currentResultsRunId = key;
      runCsvCache.clear();
      runTextCache.clear();
      currentOtuSummary = null;
      currentTaxaSummary = null;
      currentTotalReads = null;
    }

    function yieldToUi() {
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    function replaceSection(sectionId, html) {
      const el = document.getElementById(sectionId);
      if (!el) return;
      el.outerHTML = html;
    }

    function removeSection(sectionId) {
      const el = document.getElementById(sectionId);
      if (el) el.remove();
    }

    function clearLazyObserver() {
      if (lazyObserver) lazyObserver.disconnect();
      lazyLoaders.clear();
      lazyObserver = null;
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function normalizeRuntimeInfo(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const packages = Array.isArray(raw.packages) ? raw.packages : [];
      const normalizedPackages = packages
        .map(pkg => ({
          name: pkg?.name || pkg?.package || '',
          version: pkg?.version || pkg?.ver || ''
        }))
        .filter(pkg => pkg.name || pkg.version);
      return {
        rVersion: raw.r_version_full || raw.r_version || raw.rVersion || raw.r_version_string || raw.r_version_text || '',
        platform: raw.platform || raw.r_platform || raw.rPlatform || '',
        os: raw.os || raw.r_os || raw.rOs || '',
        arch: raw.arch || raw.r_arch || raw.rArch || '',
        packages: normalizedPackages
      };
    }

    function renderRuntimeInfo(runtime, options = {}) {
      const { showEmpty = false } = options;
      const normalized = normalizeRuntimeInfo(runtime);
      if (!normalized) {
        return showEmpty ? '<div class="muted">Runtime info not available.</div>' : '';
      }
      const lines = [];
      if (normalized.rVersion) {
        lines.push(`<div><strong>R:</strong> ${escapeHtml(normalized.rVersion)}</div>`);
      }
      if (normalized.platform) {
        lines.push(`<div><strong>Platform:</strong> ${escapeHtml(normalized.platform)}</div>`);
      }
      if (normalized.os || normalized.arch) {
        const osParts = [normalized.os, normalized.arch].filter(Boolean).map(escapeHtml).join(' / ');
        lines.push(`<div><strong>OS:</strong> ${osParts}</div>`);
      }
      const packageList = normalized.packages.length
        ? `<ul class="list-unstyled mb-0">${normalized.packages.map(pkg => {
            const name = escapeHtml(pkg.name);
            const version = pkg.version ? ` <span class="muted">(${escapeHtml(pkg.version)})</span>` : '';
            return `<li><span class="fw-semibold">${name}</span>${version}</li>`;
          }).join('')}</ul>`
        : '<div class="muted">No packages reported.</div>';
      return `
        <details class="mt-2">
          <summary class="fw-semibold">Runtime info</summary>
          <div class="results-meta mt-2">
            ${lines.join('')}
            ${packageList}
          </div>
        </details>
      `;
    }

    function renderBasicInfo(soil) {
      document.getElementById('sample-title').textContent = soil.sample_name || `Soil #${soil.soil_id}`;
      document.getElementById('sample-meta').textContent = `${soil.location || soil.geo_loc_name || 'Unknown location'} - ${soil.collection_date || ''}`;

      const info = `
        <p><strong>Sample name:</strong> ${soil.sample_name || 'N/A'}</p>
        <p><strong>Location:</strong> ${soil.location || soil.geo_loc_name || 'N/A'}</p>
        <p><strong>Collection date:</strong> ${soil.collection_date || 'N/A'}</p>
        <p><strong>Material:</strong> ${soil.material || soil.env_medium || 'N/A'}</p>
        <p><strong>Depth:</strong> ${soil.soil_depth ? soil.soil_depth + 'm' : 'N/A'}</p>
        <p><strong>Elevation:</strong> ${soil.elev ? soil.elev + 'm' : 'N/A'}</p>
        <p><strong>pH:</strong> ${soil.ph || 'N/A'}</p>
        <p><strong>Soil type:</strong> ${soil.soil_type || 'N/A'}</p>
        ${soil.coordinates ? `<p><strong>Coordinates:</strong> ${soil.coordinates.latitude.toFixed(4)}, ${soil.coordinates.longitude.toFixed(4)}</p>` : ''}
      `;
      const basicInfoEl = document.getElementById('basic-info');
      if (basicInfoEl) {
        basicInfoEl.innerHTML = info;
      }
    }

    function renderAlphaTests(alphaRecords) {
      const container = document.getElementById('alpha-tests');
      if (!container) return;
      if (!alphaRecords || alphaRecords.length === 0) {
        container.innerHTML = '<p class="muted">No alpha diversity records found for this soil.</p>';
        return;
      }

      let html = '<div class="card-list">';
      alphaRecords.forEach(a => {
        html += `
          <div class="card card-item">
            <div class="card-body">
              <h6 class="card-title">Alpha ID: ${a.alpha_id}</h6>
              <p class="card-text"><strong>Observed:</strong> ${a.alpha_observed}</p>
              <p class="card-text"><strong>Shannon:</strong> ${a.alpha_shannon}</p>
              <p class="card-text"><strong>Simpson:</strong> ${a.alpha_simpson}</p>
              <p class="card-text"><small class="muted">Chao1: ${a.alpha_chao1} - Goods: ${a.alpha_goods}</small></p>
            </div>
          </div>
        `;
    });
      html += '</div>';
      container.innerHTML = html;
    }

    function addFileList(targetId, files, runId = null, isResults = false) {
      const ul = document.getElementById(targetId);
      if (!ul) return;
      ul.innerHTML = '';
      if (!files || files.length === 0) {
        ul.innerHTML = '<li class="list-group-item muted">No files found</li>';
        return;
      }

      files.forEach(f => {
        const fileName = f.name || f;
        let downloadUrl = normalizeDownloadUrl(f.downloadUrl) || f.url || '';
        if (!downloadUrl && runId) {
          downloadUrl = isResults
            ? buildResultsDownloadUrl(runId, fileName)
            : `${UPLOAD_DOWNLOAD_ROUTE}/${encodeURIComponent(runId)}/${encodeURIComponent(fileName)}`;
        }
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `<span>${fileName}</span><a class="btn btn-sm btn-outline-primary" href="${downloadUrl}" target="_blank">Download</a>`;
        ul.appendChild(li);
      });
    }

    async function fetchSoil(soilId) {
      try {
        const res = await fetch(`${TABLE_BASE}/soil/${soilId}`);
        if (res.status === 401 || res.status === 403) {
          return { accessDenied: true };
        }
        if (!res.ok) {
          console.error('Soil fetch HTTP error:', res.status, res.statusText);
          return null;
        }
        const data = await res.json();
        console.log('Soil data received:', data);
        if (data.success) return data.data;
        console.warn('Soil fetch failed - API returned success:false', data);
      } catch (e) { 
        console.error('Soil fetch exception:', e); 
      }
      return null;
    }

    async function fetchAlphaBySoil(soilId) {
      // Try endpoint dedicated to alpha tests; fallback to generic alpha list and filter
      try {
        const res = await fetch(`${TABLE_BASE}/alpha/soil/${soilId}`);
        if (res.ok) {
          const d = await res.json();
          console.log('Alpha tests received:', d);
          if (d.success) return d.data;
        } else if (res.status === 401 || res.status === 403) {
          return null;
        } else {
          console.warn('Alpha fetch primary endpoint failed:', res.status);
        }
      } catch (e) { 
        console.warn('Alpha fetch primary exception:', e);
      }

      try {
        const res = await fetch(`${TABLE_BASE}/alpha`);
        if (res.ok) {
          const d = await res.json();
          if (d.success && Array.isArray(d.data)) {
            console.log('Alpha fallback - filtering from all records');
            return d.data.filter(a => String(a.soil_id) === String(soilId));
          }
        } else if (res.status === 401 || res.status === 403) {
          return null;
        }
      } catch (e) { 
        console.warn('Alpha fetch fallback exception:', e);
      }
      return [];
    }

    async function fetchSamplesBySoil(soilId) {
      try {
        const res = await fetch(`${TABLE_BASE}/samples/soil/${soilId}`);
        if (res.ok) {
          const d = await res.json();
          console.log('Samples received:', d);
          if (d.success) return d.data;
        } else if (res.status === 401 || res.status === 403) {
          return null;
        }
      } catch (e) { 
        console.warn('Samples fetch failed:', e);
      }
      return [];
    }

    async function fetchPipelineRunsBySoil(soilId) {
      try {
        const res = await fetch(`${TABLE_BASE}/pipeline-runs/soil/${soilId}`);
        if (res.ok) {
          const d = await res.json();
          console.log('Pipeline runs received:', d);
          if (d.success) return d.data;
        } else if (res.status === 401 || res.status === 403) {
          return null;
        }
      } catch (e) { 
        console.warn('Pipeline runs fetch failed:', e);
      }
      return [];
    }

    async function fetchRunLogs(runId) {
      if (!runId) return [];
      if (runLogsCache.has(runId)) return runLogsCache.get(runId);
      try {
        const res = await fetch(`${PIPELINE_STATUS_ROUTE}/${runId}`);
        if (!res.ok) {
          runLogsCache.set(runId, []);
          return [];
        }
        const data = await res.json();
        const logs = Array.isArray(data?.run?.logs) ? data.run.logs : [];
        const runtimeInfo = data?.run?.runtime_info || data?.run?.runtime || data?.run?.runtimeInfo || null;
        runLogsCache.set(runId, logs);
        runRuntimeCache.set(runId, runtimeInfo);
        return logs;
      } catch (e) {
        runLogsCache.set(runId, []);
        runRuntimeCache.set(runId, null);
        return [];
      }
    }

    function renderRunLogs(container, logs, runtimeInfo) {
      if (!container) return;
      const runtimeHtml = renderRuntimeInfo(runtimeInfo);
      if (!logs || logs.length === 0) {
        container.innerHTML = `<small class="muted">No logs available</small>${runtimeHtml}`;
        return;
      }
      const recent = logs.slice(-50);
      container.innerHTML = `
        <div class="mt-2 p-2" style="background: #f8f9fa; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 0.85em;">
          ${recent.map(log => `<div>${log}</div>`).join('')}
        </div>
        ${runtimeHtml}
      `;
    }

    async function toggleRunLogs(runId) {
      if (!runId) return;
      const container = document.getElementById(`run-logs-${runId}`);
      const button = document.querySelector(`[data-action="view-logs"][data-run-id="${runId}"]`);
      if (!container) return;

      const isVisible = container.style.display !== 'none' && container.style.display !== '';
      if (isVisible) {
        container.style.display = 'none';
        if (button) button.textContent = 'View logs';
        return;
      }

      container.style.display = 'block';
      if (runLogsCache.has(runId)) {
        const cachedLogs = runLogsCache.get(runId) || [];
        const runtimeInfo = runRuntimeCache.get(runId) || null;
        renderRunLogs(container, cachedLogs, runtimeInfo);
        if (button) button.textContent = cachedLogs.length ? `Hide logs (${cachedLogs.length})` : 'Hide logs';
        return;
      }

      container.innerHTML = '<small class="muted">Loading logs...</small>';
      const logs = await fetchRunLogs(runId);
      const runtimeInfo = runRuntimeCache.get(runId) || null;
      renderRunLogs(container, logs, runtimeInfo);
      if (button) button.textContent = logs.length ? `Hide logs (${logs.length})` : 'Hide logs';
    }

    function renderSamples(samples) {
      const container = document.getElementById('samples-list');
      if (!container) return;
      if (!samples || samples.length === 0) {
        container.innerHTML = '<p class="muted">No samples found for this soil.</p>';
        return;
      }

      let html = '<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr>';
      html += '<th>ID</th><th>Kingdom</th><th>Phylum</th><th>Class</th><th>Order</th><th>Family</th><th>Genus</th><th>Species</th>';
      html += '</tr></thead><tbody>';
      
      samples.forEach(s => {
        html += `<tr>
          <td>${s.sample_id}</td>
          <td>${s.tax_kingdom || '-'}</td>
          <td>${s.tax_phylum || '-'}</td>
          <td>${s.tax_class || '-'}</td>
          <td>${s.tax_order || '-'}</td>
          <td>${s.tax_family || '-'}</td>
          <td>${s.tax_genus || '-'}</td>
          <td>${s.tax_species || '-'}</td>
        </tr>`;
      });
      
      html += '</tbody></table></div>';
      html += `<small class="muted">${samples.length} sample(s) total</small>`;
      container.innerHTML = html;
    }

    function renderPipelineRuns(runs) {
      const container = document.getElementById('pipeline-runs');
      if (!runs || runs.length === 0) {
        container.innerHTML = '<p class="muted">No pipeline runs found for this soil.</p>';
        return;
      }

      pipelineRunsCache = Array.isArray(runs) ? runs : [];
      runLogsCache.clear();
      runRuntimeCache.clear();
      let html = '';
      runs.forEach(run => {
        const statusClass = run.status === 'completed' ? 'success' : 
                           run.status === 'failed' ? 'danger' : 
                           run.status === 'running' ? 'primary' : 'secondary';
        
        const duration = run.started_at && run.finished_at ? 
          Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000) + 's' : 
          'N/A';

        html += `
          <div class="card mb-2 run-card" data-run-id="${run.run_id}">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><strong>Run ${run.run_id.substring(0, 8)}</strong></span>
              <span class="badge bg-${statusClass}">${run.status}</span>
            </div>
            <div class="card-body p-2">
              <small>
                ${run.user_email ? `<strong>User:</strong> ${run.user_email}<br>` : ''}
                <strong>Type:</strong> ${run.pipeline_type}<br>
                <strong>Created:</strong> ${new Date(run.created_at).toLocaleString()}<br>
                ${run.started_at ? `<strong>Started:</strong> ${new Date(run.started_at).toLocaleString()}<br>` : ''}
                ${run.finished_at ? `<strong>Finished:</strong> ${new Date(run.finished_at).toLocaleString()}<br>` : ''}
                <strong>Duration:</strong> ${duration}<br>
                ${run.error_message ? `<strong class="text-danger">Error:</strong> ${run.error_message}<br>` : ''}
              </small>
              <div class="mt-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="view-logs" data-run-id="${run.run_id}">
                  View logs
                </button>
                <div class="mt-2" id="run-logs-${run.run_id}" style="display: none;"></div>
              </div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" data-action="view-results" data-run-id="${run.run_id}">
                  View results
                </button>
              </div>
            </div>
          </div>
        `;
      });
      
      container.innerHTML = html;
    }

    function renderResultsShell() {
      return `
        <div class="results-grid" id="results-cards">
          <div id="run-info-card" class="results-card">
            <h6>Run overview</h6>
            <p class="muted">Loading run details...</p>
          </div>
          <div id="summary-stats-card" class="results-card">
            <h6>Summary stats</h6>
            <p class="muted">Loading summary stats...</p>
          </div>
          <div id="missing-outputs-card" class="results-card" style="display: none;"></div>
        </div>
        <div id="results-plots" class="results-card mt-3" data-lazy="plots">
          <h6>Pipeline plots</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-alpha" class="results-card mt-3" data-lazy="alpha">
          <h6>Alpha diversity metrics</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-metadata" class="results-card mt-3" data-lazy="metadata">
          <h6>Sample metadata</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-taxa" class="results-card mt-3" data-lazy="taxa">
          <h6>Top taxa (genus)</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-otu" class="results-card mt-3" data-lazy="otu">
          <h6>Top OTU sequences</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-tax-table" class="results-card mt-3" data-lazy="tax-table">
          <h6>Taxonomy table</h6>
          <p class="muted">Loads when visible.</p>
        </div>
        <div id="results-files" class="results-card mt-3">
          <h6>Result files</h6>
          <p class="muted">Loading files...</p>
        </div>
      `;
    }

    function getExpectedOutputs(pipelineType) {
      const common = [
        { name: 'pipeline_summary_stats.csv', label: 'Summary stats', required: true },
        { name: 'alpha_diversity_metrics.csv', label: 'Alpha diversity metrics', required: true },
        { name: 'otu_table.csv', label: 'OTU table', required: true },
        { name: 'tax_table.csv', label: 'Taxonomy table', required: true },
        { name: 'sample_metadata.csv', label: 'Sample metadata', required: true },
        { name: 'pipeline_status.json', label: 'Pipeline status', required: false },
        { name: 'pipeline_runtime.json', label: 'Runtime info', required: false },
        { name: 'taxa_barplot_genus.png', label: 'Taxa barplot (genus)', required: false },
        { name: 'taxa_barplot.png', label: 'Taxa barplot', required: false },
        { name: 'beta_diversity_pcoa.png', label: 'Beta diversity PCoA', required: false },
        { name: 'beta_diversity.png', label: 'Beta diversity', required: false }
      ];
      const type = String(pipelineType || '').toLowerCase();
      if (type.includes('iontorrent')) return common;
      return common;
    }

    function renderMissingOutputsCard(missingRequired, missingOptional, runStatus, sectionId) {
      if ((!missingRequired || missingRequired.length === 0) && (!missingOptional || missingOptional.length === 0)) {
        return '';
      }
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      const status = String(runStatus || '').toLowerCase();
      const isFinal = status === 'completed' || status === 'failed';
      const tip = isFinal
        ? 'Tip: if the run is completed, rerun the pipeline or verify the input uploads and output volume.'
        : 'Tip: this run is not completed. Missing files may appear after it finishes.';
      const requiredList = (missingRequired || []).map(item => {
        const label = item.label ? ` <span class="muted">(${item.label})</span>` : '';
        return `<li><strong>${item.name}</strong>${label}</li>`;
      }).join('');
      const optionalList = (missingOptional || []).map(item => {
        const label = item.label ? ` <span class="muted">(${item.label})</span>` : '';
        return `<li><strong>${item.name}</strong>${label}</li>`;
      }).join('');
      const optionalNote = missingOptional && missingOptional.length
        ? '<small class="muted">Some plots depend on sample count and may be absent for single-sample runs.</small>'
        : '';
      return `
        <div${idAttr} class="results-card">
          <h6>Missing outputs</h6>
          ${requiredList ? `<div><strong>Missing core outputs</strong><ul class="muted">${requiredList}</ul></div>` : ''}
          ${optionalList ? `<div><strong>Missing optional outputs</strong><ul class="muted">${optionalList}</ul></div>${optionalNote}` : ''}
          <small class="muted">${tip}</small>
        </div>
      `;
    }

    function setupLazySections(sections) {
      clearLazyObserver();
      if (!sections || sections.length === 0) return;
      if (!('IntersectionObserver' in window)) {
        sections.forEach(section => section.load());
        return;
      }
      lazyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          const loader = lazyLoaders.get(id);
          if (!loader) return;
          lazyLoaders.delete(id);
          entry.target.dataset.lazyState = 'loading';
          loader().catch(() => {});
          lazyObserver.unobserve(entry.target);
        });
      }, { rootMargin: '200px 0px', threshold: 0.1 });
      sections.forEach(section => {
        const el = document.getElementById(section.id);
        if (!el) return;
        lazyLoaders.set(section.id, section.load);
        el.dataset.lazyState = 'pending';
        lazyObserver.observe(el);
      });
    }

    const resultsPanelEl = () => document.getElementById('pipeline-results-panel');
    const resultsSubtitleEl = () => document.getElementById('pipeline-results-subtitle');
    const resultsContentEl = () => document.getElementById('pipeline-results-content');

    function showResultsPanel(show) {
      const panel = resultsPanelEl();
      if (panel) panel.style.display = show ? 'block' : 'none';
    }

    function selectRunCard(runId) {
      const cards = document.querySelectorAll('.run-card');
      cards.forEach(card => {
        const match = card.getAttribute('data-run-id') === String(runId);
        card.classList.toggle('selected', match);
      });
    }

    function formatBytes(bytes) {
      const value = Number(bytes);
      if (!value) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = value;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
      }
      const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
      return `${size.toFixed(precision)} ${units[unitIndex]}`;
    }

    function buildResultsDownloadUrl(runId, filename) {
      if (!runId || !filename) return '#';
      return `${RESULTS_DOWNLOAD_ROUTE}/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`;
    }

    function buildUploadDownloadUrl(runId, filename) {
      if (!runId || !filename) return '#';
      return `${UPLOAD_DOWNLOAD_ROUTE}/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`;
    }

    function normalizeDownloadUrl(url) {
      if (!url) return '';
      if (url.startsWith('/api/results/')) {
        return url.replace('/api/results/', '/results/');
      }
      return url;
    }

    function formatHeaderLabel(key) {
      if (!key) return '';
      const cleaned = String(key).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleaned) return '';
      return cleaned.split(' ').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
    }

    function resolveSampleColumn(keys) {
      if (!Array.isArray(keys)) return '';
      const candidates = ['sample', 'sample_name', 'sampleid', 'sample_id', 'sample name', 'sample id'];
      const lowerMap = new Map(keys.map(key => [key.toLowerCase(), key]));
      for (const candidate of candidates) {
        if (lowerMap.has(candidate)) return lowerMap.get(candidate);
      }
      const fallback = keys.find(key => key.toLowerCase().includes('sample'));
      return fallback || keys[0] || '';
    }

    function parseCsv(text) {
      if (!text) return [];
      const rows = [];
      let row = [];
      let field = '';
      let inQuotes = false;

      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"') {
          if (inQuotes && text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(field);
          field = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
          if (char === '\r' && text[i + 1] === '\n') {
            i += 1;
          }
          row.push(field);
          field = '';
          if (row.some(cell => cell !== '')) rows.push(row);
          row = [];
        } else {
          field += char;
        }
      }

      row.push(field);
      if (row.some(cell => cell !== '')) rows.push(row);

      if (rows.length === 0) return [];
      const headers = rows.shift().map((h, idx) => {
        const cleaned = h.replace(/^\uFEFF/, '').trim();
        return cleaned || `column_${idx + 1}`;
      });

      return rows.map(r => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = (r[idx] ?? '').trim();
        });
        return obj;
      });
    }

    function getRowValue(row, key) {
      if (!row) return '';
      if (row[key] !== undefined) return row[key];
      const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
      return found ? row[found] : '';
    }

    function shortenSequence(sequence) {
      if (!sequence) return '-';
      const value = String(sequence);
      if (value.length <= 32) return value;
      return `${value.slice(0, 24)}...${value.slice(-6)}`;
    }

    function computeOtuSummary(otuRows) {
      if (!Array.isArray(otuRows) || otuRows.length === 0) return null;
      const headers = Object.keys(otuRows[0] || {});
      const seqKey = headers.find(h => h.toLowerCase() === 'sequence') || 'sequence';
      const sampleColumns = headers.filter(h => h !== seqKey && h !== '');
      const seqMap = new Map();
      let totalReads = 0;

      otuRows.forEach(row => {
        const sequence = getRowValue(row, seqKey) || getRowValue(row, 'sequence') || getRowValue(row, '');
        if (!sequence) return;
        let total = 0;
        const perSample = sampleColumns.map(col => {
          const val = Number(getRowValue(row, col)) || 0;
          total += val;
          return { name: col, value: val };
        });
        totalReads += total;
        seqMap.set(sequence, { sequence, total, perSample });
      });

      const sequences = Array.from(seqMap.values()).sort((a, b) => b.total - a.total);
      return { sampleColumns, sequences, totalReads, seqMap };
    }

    function pickTaxonLabel(row) {
      const keys = ['genus', 'family', 'order', 'class', 'phylum', 'kingdom'];
      for (const key of keys) {
        const raw = String(getRowValue(row, key) || '').trim();
        if (raw && raw !== 'NA' && raw !== 'N/A' && raw !== 'null') {
          return raw;
        }
      }
      return 'Unclassified';
    }

    function buildTaxaSummary(taxRows, otuSummary) {
      if (!Array.isArray(taxRows) || taxRows.length === 0 || !otuSummary) return null;
      const taxaMap = new Map();
      taxRows.forEach(row => {
        const sequence = getRowValue(row, 'sequence') || getRowValue(row, '');
        if (!sequence) return;
        const otu = otuSummary.seqMap.get(sequence);
        if (!otu) return;
        const label = pickTaxonLabel(row);
        const current = taxaMap.get(label) || { taxon: label, reads: 0, sequences: 0 };
        current.reads += otu.total;
        current.sequences += 1;
        taxaMap.set(label, current);
      });
      return Array.from(taxaMap.values()).sort((a, b) => b.reads - a.reads);
    }

    function renderSummaryStatsCard(summaryRows, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!summaryRows || summaryRows.length === 0) {
        return `
          <div${idAttr} class="results-card">
            <h6>Summary stats</h6>
            <p class="muted">Summary stats not found for this run.</p>
          </div>
        `;
      }
      const labelMap = {
        total_samples: 'Total samples',
        total_taxa: 'Total taxa',
        total_reads: 'Total reads'
      };
      const rows = summaryRows.map(row => {
        const metric = String(getRowValue(row, 'metric') || '').trim();
        const key = metric.toLowerCase();
        const label = labelMap[key] || metric || 'Metric';
        const value = getRowValue(row, 'value') || '-';
        return `<div><strong>${label}:</strong> ${value}</div>`;
      }).join('');
      return `
        <div${idAttr} class="results-card">
          <h6>Summary stats</h6>
          <div class="results-meta">${rows}</div>
        </div>
      `;
    }

    function renderRunInfoCard(run, statusData, fileCount, runId, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      const runIdLabel = run?.run_id || runId || '';
      const statusLine = statusData?.status ? `<div><strong>Status:</strong> ${statusData.status}</div>` : '';
      const messageLine = statusData?.message ? `<div><strong>Message:</strong> ${statusData.message}</div>` : '';
      const timestampLine = statusData?.timestamp ? `<div><strong>Pipeline time:</strong> ${statusData.timestamp}</div>` : '';
        const fileLine = Number.isFinite(fileCount) ? `<div><strong>Files:</strong> ${fileCount}</div>` : '';
        const runtimeBlock = renderRuntimeInfo(statusData?.runtime || statusData?.runtime_info || statusData?.runtimeInfo || null);

      return `
        <div${idAttr} class="results-card">
          <h6>Run overview</h6>
            <div class="results-meta">
              <div><strong>Run ID:</strong> ${String(runIdLabel).slice(0, 12)}</div>
              ${run?.pipeline_type ? `<div><strong>Pipeline:</strong> ${run.pipeline_type}</div>` : ''}
              ${run?.created_at ? `<div><strong>Created:</strong> ${new Date(run.created_at).toLocaleString()}</div>` : ''}
              ${statusLine}
              ${messageLine}
              ${timestampLine}
              ${fileLine}
            </div>
            ${runtimeBlock}
          </div>
        `;
      }

    function renderAlphaSection(alphaRows, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!alphaRows || alphaRows.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Alpha diversity metrics</h6>
            <p class="muted">Alpha diversity metrics not found for this run.</p>
          </div>
        `;
      }
      const rows = alphaRows.map(row => `
        <tr>
          <td>${getRowValue(row, 'sample') || '-'}</td>
          <td>${getRowValue(row, 'observed') || '-'}</td>
          <td>${getRowValue(row, 'shannon') || '-'}</td>
          <td>${getRowValue(row, 'simpson') || '-'}</td>
          <td>${getRowValue(row, 'chao1') || '-'}</td>
          <td>${getRowValue(row, 'goods') || '-'}</td>
        </tr>
      `).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Alpha diversity metrics</h6>
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Observed</th>
                  <th>Shannon</th>
                  <th>Simpson</th>
                  <th>Chao1</th>
                  <th>Goods</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderMetadataSection(metaRows, sectionId, sourceLabel = '') {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!metaRows || metaRows.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Sample metadata</h6>
            <p class="muted">Sample metadata not found for this run.</p>
          </div>
        `;
      }
      const keys = Object.keys(metaRows[0] || {});
      const sampleKey = resolveSampleColumn(keys);
      const columnKeys = [sampleKey, ...keys.filter(key => key !== sampleKey)];
      const headerCells = columnKeys.map(key => {
        const label = key === sampleKey ? 'Sample' : formatHeaderLabel(key);
        return `<th>${label}</th>`;
      }).join('');
      const rows = metaRows.map(row => {
        const cells = columnKeys.map(key => `<td>${getRowValue(row, key) || '-'}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Sample metadata</h6>
          ${sourceLabel ? `<p class="muted">Source: ${sourceLabel}</p>` : ''}
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>${headerCells}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderTaxaSection(taxaSummary, totalReads, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!taxaSummary || taxaSummary.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Top taxa (genus)</h6>
            <p class="muted">No taxonomy summary available for this run.</p>
          </div>
        `;
      }
      const top = taxaSummary.slice(0, 10);
      const total = Number(totalReads) || top.reduce((sum, row) => sum + row.reads, 0);
      const rows = top.map(row => {
        const percent = total ? ((row.reads / total) * 100).toFixed(1) : '0.0';
        return `
          <tr>
            <td>${row.taxon}</td>
            <td>${row.reads}</td>
            <td>${percent}%</td>
            <td>${row.sequences}</td>
          </tr>
        `;
      }).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Top taxa (genus)</h6>
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>
                  <th>Taxon</th>
                  <th>Reads</th>
                  <th>Percent</th>
                  <th>Sequences</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderOtuSection(otuSummary, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!otuSummary || otuSummary.sequences.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Top OTU sequences</h6>
            <p class="muted">OTU table not available for this run.</p>
          </div>
        `;
      }
      const top = otuSummary.sequences.slice(0, 10);
      const headers = otuSummary.sampleColumns.map(col => `<th>${col}</th>`).join('');
      const rows = top.map(row => {
        const perSample = row.perSample.map(sample => `<td>${sample.value}</td>`).join('');
        return `
          <tr>
            <td class="sequence-code">${shortenSequence(row.sequence)}</td>
            <td>${row.total}</td>
            ${perSample}
          </tr>
        `;
      }).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Top OTU sequences</h6>
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Total</th>
                  ${headers}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <small class="muted">Showing top 10 sequences by total reads. Download the full OTU table for complete data.</small>
        </div>
      `;
    }

    function renderTaxTableSection(taxRows, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!taxRows || taxRows.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Taxonomy table</h6>
            <p class="muted">Taxonomy table not available for this run.</p>
          </div>
        `;
      }
      const preview = taxRows.slice(0, 15);
      const rows = preview.map(row => `
        <tr>
          <td class="sequence-code">${shortenSequence(getRowValue(row, 'sequence') || getRowValue(row, ''))}</td>
          <td>${getRowValue(row, 'kingdom') || '-'}</td>
          <td>${getRowValue(row, 'phylum') || '-'}</td>
          <td>${getRowValue(row, 'class') || '-'}</td>
          <td>${getRowValue(row, 'order') || '-'}</td>
          <td>${getRowValue(row, 'family') || '-'}</td>
          <td>${getRowValue(row, 'genus') || '-'}</td>
          <td>${getRowValue(row, 'species') || '-'}</td>
        </tr>
      `).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Taxonomy table (preview)</h6>
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Kingdom</th>
                  <th>Phylum</th>
                  <th>Class</th>
                  <th>Order</th>
                  <th>Family</th>
                  <th>Genus</th>
                  <th>Species</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <small class="muted">Preview of the first 15 rows. Download the full taxonomy table for complete data.</small>
        </div>
      `;
    }

    function renderPlotsSection(fileMap, runId, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      const plotConfigs = [
        { name: 'taxa_barplot_genus.png', label: 'Taxa barplot (genus)' },
        { name: 'taxa_barplot.png', label: 'Taxa barplot' },
        { name: 'beta_diversity_pcoa.png', label: 'Beta diversity PCoA' },
        { name: 'beta_diversity.png', label: 'Beta diversity' }
      ];
      const available = plotConfigs.filter(plot => fileMap.has(plot.name));
      if (available.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Pipeline plots</h6>
            <p class="muted">No plot images were generated for this run.</p>
          </div>
        `;
      }
      const images = available.map(plot => `
        <div class="results-image">
          <img src="${buildResultsDownloadUrl(runId, plot.name)}" alt="${plot.label}" loading="lazy" decoding="async">
          <div class="mt-2 muted">${plot.label}</div>
        </div>
      `).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Pipeline plots</h6>
          <div class="results-images">${images}</div>
        </div>
      `;
    }

    function renderFilesSection(files, runId, sectionId) {
      const idAttr = sectionId ? ` id="${sectionId}"` : '';
      if (!files || files.length === 0) {
        return `
          <div${idAttr} class="results-card mt-3">
            <h6>Result files</h6>
            <p class="muted">No result files found for this run.</p>
          </div>
        `;
      }
      const rows = files.map(file => {
        const name = file.name || '-';
        const size = formatBytes(file.size);
        const modified = file.modified ? new Date(file.modified).toLocaleString() : '-';
        const downloadUrl = normalizeDownloadUrl(file.downloadUrl) || buildResultsDownloadUrl(runId, name);
        return `
          <tr>
            <td>${name}</td>
            <td>${size}</td>
            <td>${modified}</td>
            <td><a class="btn btn-sm btn-outline-primary" href="${downloadUrl}" target="_blank">Download</a></td>
          </tr>
        `;
      }).join('');
      return `
        <div${idAttr} class="results-card mt-3">
          <h6>Result files</h6>
          <div class="table-responsive">
            <table class="table table-sm results-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    async function fetchResultFiles(runId) {
      if (!runId) return [];
      try {
        const res = await fetch(`${RESULTS_FILES_ROUTE}/${runId}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.files) ? data.files : [];
      } catch (e) {
        console.warn('Result files fetch failed:', e);
        return [];
      }
    }

    async function fetchCsvFile(runId, filename) {
      if (!runId || !filename) return [];
      try {
        const res = await fetch(buildResultsDownloadUrl(runId, filename));
        if (!res.ok) return [];
        const text = await res.text();
        return parseCsv(text);
      } catch (e) {
        console.warn(`Failed to fetch CSV ${filename}:`, e);
        return [];
      }
    }

    async function fetchTextFile(runId, filename) {
      if (!runId || !filename) return '';
      try {
        const res = await fetch(buildResultsDownloadUrl(runId, filename));
        if (!res.ok) return '';
        return await res.text();
      } catch (e) {
        console.warn(`Failed to fetch file ${filename}:`, e);
        return '';
      }
    }

    async function fetchUploadFiles(runId) {
      if (!runId) return [];
      try {
        const res = await fetch(`${UPLOAD_FILES_ROUTE}/${runId}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.files) ? data.files : [];
      } catch (e) {
        console.warn('Upload files fetch failed:', e);
        return [];
      }
    }

    function pickMetadataFile(files) {
      if (!Array.isArray(files)) return null;
      const csvFiles = files.filter(file => String(file?.name || file || '').toLowerCase().endsWith('.csv'));
      if (!csvFiles.length) return null;
      const metadataNamed = csvFiles.find(file => String(file?.name || file || '').toLowerCase().includes('metadata'));
      if (metadataNamed) return metadataNamed;
      return csvFiles[0];
    }

    async function fetchUploadMetadataRows(runId) {
      const files = await fetchUploadFiles(runId);
      const metadataFile = pickMetadataFile(files);
      if (!metadataFile) return { rows: [], source: '' };
      const filename = metadataFile.name || metadataFile;
      try {
        const res = await fetch(buildUploadDownloadUrl(runId, filename));
        if (!res.ok) return { rows: [], source: '' };
        const text = await res.text();
        return { rows: parseCsv(text), source: filename };
      } catch (e) {
        console.warn('Upload metadata fetch failed:', e);
        return { rows: [], source: '' };
      }
    }

    function fetchCsvCached(runId, filename) {
      const key = `${runId}:${filename}`;
      if (runCsvCache.has(key)) return runCsvCache.get(key);
      const promise = fetchCsvFile(runId, filename);
      runCsvCache.set(key, promise);
      return promise;
    }

    function fetchTextCached(runId, filename) {
      const key = `${runId}:${filename}`;
      if (runTextCache.has(key)) return runTextCache.get(key);
      const promise = fetchTextFile(runId, filename);
      runTextCache.set(key, promise);
      return promise;
    }

    async function getOtuSummaryForRun(runId) {
      if (currentOtuSummary) return currentOtuSummary;
      const rows = await fetchCsvCached(runId, 'otu_table.csv');
      currentOtuSummary = computeOtuSummary(rows);
      return currentOtuSummary;
    }

    async function getTaxaSummaryForRun(runId) {
      if (currentTaxaSummary) return currentTaxaSummary;
      const [taxRows, otuSummary] = await Promise.all([
        fetchCsvCached(runId, 'tax_table.csv'),
        getOtuSummaryForRun(runId)
      ]);
      currentTaxaSummary = buildTaxaSummary(taxRows, otuSummary);
      return currentTaxaSummary;
    }

    async function loadSummaryStatsSection(runId, fileMap) {
      const hasFile = fileMap.has('pipeline_summary_stats.csv');
      const rows = hasFile ? await fetchCsvCached(runId, 'pipeline_summary_stats.csv') : [];
      if (rows.length) {
        const totalRow = rows.find(row => String(getRowValue(row, 'metric')).toLowerCase() === 'total_reads');
        currentTotalReads = Number(getRowValue(totalRow, 'value')) || currentTotalReads;
      }
      replaceSection('summary-stats-card', renderSummaryStatsCard(rows, 'summary-stats-card'));
    }

    async function loadStatusData(runId, fileMap, run, fileCount) {
      let statusData = null;
      if (fileMap.has('pipeline_status.json')) {
        const statusText = await fetchTextCached(runId, 'pipeline_status.json');
        if (statusText) {
          try {
            statusData = JSON.parse(statusText);
          } catch (e) {
            statusData = null;
          }
        }
      }
      replaceSection('run-info-card', renderRunInfoCard(run, statusData, fileCount, runId, 'run-info-card'));
    }

    async function loadPlotsSection(fileMap, runId) {
      replaceSection('results-plots', renderPlotsSection(fileMap, runId, 'results-plots'));
    }

    async function loadAlphaSection(runId, fileMap) {
      await yieldToUi();
      const rows = fileMap.has('alpha_diversity_metrics.csv')
        ? await fetchCsvCached(runId, 'alpha_diversity_metrics.csv')
        : [];
      replaceSection('results-alpha', renderAlphaSection(rows, 'results-alpha'));
    }

    async function loadMetadataSection(runId, fileMap) {
      await yieldToUi();
      const uploadMeta = await fetchUploadMetadataRows(runId);
      if (uploadMeta.rows.length) {
        replaceSection('results-metadata', renderMetadataSection(uploadMeta.rows, 'results-metadata', uploadMeta.source));
        return;
      }
      const rows = fileMap.has('sample_metadata.csv')
        ? await fetchCsvCached(runId, 'sample_metadata.csv')
        : [];
      replaceSection('results-metadata', renderMetadataSection(rows, 'results-metadata', rows.length ? 'pipeline sample list' : ''));
    }

    async function loadTaxaSection(runId, fileMap) {
      await yieldToUi();
      if (!fileMap.has('tax_table.csv') || !fileMap.has('otu_table.csv')) {
        replaceSection('results-taxa', renderTaxaSection([], 0, 'results-taxa'));
        return;
      }
      const taxaSummary = await getTaxaSummaryForRun(runId);
      if (!currentTotalReads) {
        const otuSummary = currentOtuSummary || await getOtuSummaryForRun(runId);
        currentTotalReads = otuSummary ? otuSummary.totalReads : 0;
      }
      replaceSection('results-taxa', renderTaxaSection(taxaSummary, currentTotalReads, 'results-taxa'));
    }

    async function loadOtuSection(runId, fileMap) {
      await yieldToUi();
      if (!fileMap.has('otu_table.csv')) {
        replaceSection('results-otu', renderOtuSection(null, 'results-otu'));
        return;
      }
      const otuSummary = await getOtuSummaryForRun(runId);
      replaceSection('results-otu', renderOtuSection(otuSummary, 'results-otu'));
    }

    async function loadTaxTableSection(runId, fileMap) {
      await yieldToUi();
      const rows = fileMap.has('tax_table.csv')
        ? await fetchCsvCached(runId, 'tax_table.csv')
        : [];
      replaceSection('results-tax-table', renderTaxTableSection(rows, 'results-tax-table'));
    }

    async function loadRunResultsById(runId) {
      if (!runId) return;
      showResultsPanel(true);
      selectRunCard(runId);
      resetResultsCaches(runId);
      clearLazyObserver();
      if (resultsContentEl()) resultsContentEl().innerHTML = renderResultsShell();

      const run = pipelineRunsCache.find(item => String(item.run_id) === String(runId));
      if (resultsSubtitleEl()) {
        const type = run?.pipeline_type ? ` - ${run.pipeline_type}` : '';
        const status = run?.status ? ` - ${run.status}` : '';
        resultsSubtitleEl().textContent = `Run ${String(runId).slice(0, 8)}${type}${status}`;
      }

      await yieldToUi();
      const files = await fetchResultFiles(runId);
      const fileMap = new Map(files.map(file => [file.name, file]));

      const expected = getExpectedOutputs(run?.pipeline_type);
      const missingRequired = expected.filter(item => item.required && !fileMap.has(item.name));
      const missingOptional = expected.filter(item => !item.required && !fileMap.has(item.name));
      if (missingRequired.length || missingOptional.length) {
        const missingCard = renderMissingOutputsCard(missingRequired, missingOptional, run?.status, 'missing-outputs-card');
        if (missingCard) replaceSection('missing-outputs-card', missingCard);
      } else {
        removeSection('missing-outputs-card');
      }

      replaceSection('results-files', renderFilesSection(files, runId, 'results-files'));
      replaceSection('run-info-card', renderRunInfoCard(run, null, files.length, runId, 'run-info-card'));
      void loadStatusData(runId, fileMap, run, files.length);
      void loadSummaryStatsSection(runId, fileMap);

      setupLazySections([
        { id: 'results-plots', load: () => loadPlotsSection(fileMap, runId) },
        { id: 'results-alpha', load: () => loadAlphaSection(runId, fileMap) },
        { id: 'results-metadata', load: () => loadMetadataSection(runId, fileMap) },
        { id: 'results-taxa', load: () => loadTaxaSection(runId, fileMap) },
        { id: 'results-otu', load: () => loadOtuSection(runId, fileMap) },
        { id: 'results-tax-table', load: () => loadTaxTableSection(runId, fileMap) }
      ]);
    }

    function setupResultsActions() {
      const container = document.getElementById('pipeline-runs');
      if (container && !container.dataset.resultsBound) {
        container.dataset.resultsBound = 'true';
        container.addEventListener('click', event => {
          const logButton = event.target.closest('[data-action="view-logs"]');
          if (logButton) {
            const runId = logButton.getAttribute('data-run-id');
            if (runId) toggleRunLogs(runId);
            return;
          }

          const button = event.target.closest('[data-action="view-results"]');
          if (!button) return;
          const runId = button.getAttribute('data-run-id');
          if (runId) loadRunResultsById(runId);
        });
      }
      const closeBtn = document.getElementById('close-results-btn');
      if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = 'true';
        closeBtn.addEventListener('click', () => {
          showResultsPanel(false);
        });
      }
    }

    async function fetchFilesForRun(runId) {
      if (!runId) return { uploads: [], results: [] };
      const uploads = [];
      const results = [];
      try {
        const u = await fetch(`${UPLOAD_FILES_ROUTE}/${runId}`);
        if (u.ok) { const ud = await u.json(); if (ud.files) uploads.push(...ud.files); }
      } catch (e) { console.warn('Upload files fetch failed', e); }

      try {
        const r = await fetch(`${RESULTS_FILES_ROUTE}/${runId}`);
        if (r.ok) { const rd = await r.json(); if (rd.files) results.push(...rd.files); }
      } catch (e) { console.warn('Results files fetch failed', e); }

      return { uploads, results };
    }

    // Main
    (async function() {
      if (typeof getAuthStatus === 'function') {
        const status = await getAuthStatus();
        if (!status.authenticated) {
          renderUnauthorizedState();
          return;
        }
      }

      const soilId = getSoilId();
      if (!soilId) {
        document.getElementById('sample-title').textContent = 'Error';
        document.getElementById('sample-meta').textContent = '';
        const basicInfoEl = document.getElementById('basic-info');
        if (basicInfoEl) {
          basicInfoEl.innerHTML = '<div class="alert alert-danger"><strong>Soil data not found</strong><br>No soil ID provided in URL. Please use <code>?soilId=123</code> or <code>?id=123</code>.</div>';
        }
        const alphaTestsEl = document.getElementById('alpha-tests');
        if (alphaTestsEl) alphaTestsEl.innerHTML = '';
        return;
      }

      const soil = await fetchSoil(soilId);
      if (soil && soil.accessDenied) {
        renderUnauthorizedState();
        return;
      }

      if (!soil) {
        document.getElementById('sample-title').textContent = 'Error';
        document.getElementById('sample-meta').textContent = '';
        const basicInfoEl = document.getElementById('basic-info');
        if (basicInfoEl) {
          basicInfoEl.innerHTML = '<div class="alert alert-danger"><strong>Soil data not found</strong><br>No soil sample found with ID <code>' + soilId + '</code>.</div>';
        }
        const alphaTestsEl = document.getElementById('alpha-tests');
        if (alphaTestsEl) alphaTestsEl.innerHTML = '';
        const samplesEl = document.getElementById('samples-list');
        if (samplesEl) samplesEl.innerHTML = '';
        const pipelineRunsEl = document.getElementById('pipeline-runs');
        if (pipelineRunsEl) pipelineRunsEl.innerHTML = '';
        return;
      }
      renderBasicInfo(soil);

      const alphaTestsEl = document.getElementById('alpha-tests');
      if (alphaTestsEl) {
        const alphas = await fetchAlphaBySoil(soilId);
        if (alphas === null) {
          renderUnauthorizedState();
          return;
        }
        renderAlphaTests(alphas);
      }

      // Fetch and render samples (optional)
      const samplesEl = document.getElementById('samples-list');
      if (samplesEl) {
        const samples = await fetchSamplesBySoil(soilId);
        if (samples === null) {
          renderUnauthorizedState();
          return;
        }
        renderSamples(samples);
      }

      // Fetch and render pipeline runs
      const pipelineRuns = await fetchPipelineRunsBySoil(soilId);
      if (pipelineRuns === null) {
        renderUnauthorizedState();
        return;
      }
      renderPipelineRuns(pipelineRuns);
      setupResultsActions();

      const preferredRun = Array.isArray(pipelineRuns) && pipelineRuns.length
        ? (pipelineRuns.find(run => run.status === 'completed') || pipelineRuns[0])
        : null;
      if (preferredRun?.run_id) {
        await loadRunResultsById(preferredRun.run_id);
      }

      const runId = preferredRun?.run_id || soil.run_id || soil.runId || null;
      const uploadFilesEl = document.getElementById('upload-files');
      const resultFilesEl = document.getElementById('result-files');
      if (uploadFilesEl || resultFilesEl) {
        const files = await fetchFilesForRun(runId);
        addFileList('upload-files', files.uploads, runId, false);
        addFileList('result-files', files.results, runId, true);
      }
    })();

    function renderUnauthorizedState() {
      document.getElementById('sample-title').textContent = 'Sample details';
      document.getElementById('sample-meta').textContent = '';
      const basicInfoEl = document.getElementById('basic-info');
      if (basicInfoEl) basicInfoEl.innerHTML = '';
      const alphaTestsEl = document.getElementById('alpha-tests');
      if (alphaTestsEl) alphaTestsEl.innerHTML = '';
      const samplesEl = document.getElementById('samples-list');
      if (samplesEl) samplesEl.innerHTML = '';
      const pipelineRunsEl = document.getElementById('pipeline-runs');
      if (pipelineRunsEl) pipelineRunsEl.innerHTML = '';
      showResultsPanel(false);
      if (resultsContentEl()) resultsContentEl().innerHTML = '';
      if (resultsSubtitleEl()) resultsSubtitleEl().textContent = 'Select a pipeline run to view results.';
      addFileList('upload-files', []);
      addFileList('result-files', []);
      runLogsCache.clear();
      runRuntimeCache.clear();
    }
})();
