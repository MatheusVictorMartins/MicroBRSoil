(() => {
const APP_CONSTANTS = window.APP_CONSTANTS || {};
const ROUTES = APP_CONSTANTS.ROUTES || {};
const STATUS = APP_CONSTANTS.STATUS || {};
const MESSAGES = APP_CONSTANTS.MESSAGES || {};
const PIPELINE_STATUS = STATUS.PIPELINE || {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  ACTIVE: "active"
};
const PIPELINE_BADGES = STATUS.PIPELINE_BADGES || {
  queued: "warning",
  running: "primary",
  completed: "success",
  failed: "danger"
};
const PIPELINE_LABELS = STATUS.PIPELINE_LABELS || {
  active: "In progress",
  all: "All",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed"
};
const LOADING_MESSAGE = MESSAGES.LOADING || "Loading...";
const NO_ACCESS_MESSAGE = MESSAGES.NO_ACCESS_PIPELINES || "Access denied. Log in to view pipelines.";
const NO_PIPELINES_MESSAGE = MESSAGES.NO_PIPELINES || "No pipelines found.";
const PIPELINE_CANCEL_ROUTE = ROUTES.PIPELINE_CANCEL || "/pipeline/cancel";

const tracker = {
        intervalId: null,
        runId: null,
        autoRefresh: true,
        manualSelection: false
      };
      let isAdminUser = false;
      const runsState = {
        page: 1,
        limit: 10,
        totalPages: 1,
        totalRecords: 0
      };

      const statusEl = () => document.getElementById('trackerStatus');
      const updatedEl = () => document.getElementById('trackerUpdated');
      const messageEl = () => document.getElementById('trackerMessage');
      const runEl = () => document.getElementById('trackerRunId');
      const jobEl = () => document.getElementById('trackerJobId');
      const typeEl = () => document.getElementById('trackerPipelineType');
      const queueEl = () => document.getElementById('trackerQueue');
      const trackerBox = () => document.getElementById('pipelineTracker');
      const logsEl = () => document.getElementById('trackerLogs');
      const logsCountEl = () => document.getElementById('logsCount');
      const stepEl = () => document.getElementById('trackerStep');
      const runsBodyEl = () => document.getElementById('runsTableBody');
      const runsCountEl = () => document.getElementById('runsCount');
      const runsSubtitleEl = () => document.getElementById('runsSubtitle');
      const runsUserHeaderEl = () => document.getElementById('runsUserHeader');
      const alertsEl = () => document.getElementById('pipelineAlerts');
      const healthUpdatedEl = () => document.getElementById('healthUpdated');
      const workerHealthStatusEl = () => document.getElementById('workerHealthStatus');
      const workerHealthDetailEl = () => document.getElementById('workerHealthDetail');
      const queueHealthStatusEl = () => document.getElementById('queueHealthStatus');
      const queueHealthDetailEl = () => document.getElementById('queueHealthDetail');
      const redisHealthStatusEl = () => document.getElementById('redisHealthStatus');
      const redisHealthDetailEl = () => document.getElementById('redisHealthDetail');
      const statusFilterEl = () => document.getElementById('statusFilter');
      const dateFromEl = () => document.getElementById('dateFrom');
      const dateToEl = () => document.getElementById('dateTo');
      const userFilterGroupEl = () => document.getElementById('userFilterGroup');
      const userFilterEl = () => document.getElementById('userFilter');
      const sortByEl = () => document.getElementById('sortBy');
      const sortOrderEl = () => document.getElementById('sortOrder');
      const lastRunKey = 'lastPipelineRun';
      const failedRunsKey = 'pipelineFailedRuns';
      const seenFailures = new Set();

      function getPollSeconds() {
        const value = parseInt(document.getElementById('pollInterval')?.value, 10);
        return Math.max(3, Math.min(60, value || 5));
      }

      function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleString();
      }

      function normalizeStatus(status) {
        return String(status || "unknown").toLowerCase();
      }

      function canCancelStatus(status) {
        return status === PIPELINE_STATUS.QUEUED || status === PIPELINE_STATUS.RUNNING;
      }

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function cleanLogLine(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function isSeparatorLine(value) {
        return /^[-=]{6,}$/.test(value);
      }

      function normalizeLogLine(value) {
        const lower = value.toLowerCase();
        if (lower.startsWith('output directory:')) {
          return 'Output directory ready';
        }
        if (lower.startsWith('output:') && lower.includes('/app/results')) {
          return 'Output directory ready';
        }
        return value;
      }

      function parsePipelineLogs(logs) {
        const parsed = { steps: [], info: [], currentStep: null };
        const stepIndex = new Map();
        let lastInfo = null;

        (Array.isArray(logs) ? logs : []).forEach((raw) => {
          let line = cleanLogLine(raw);
          if (!line || isSeparatorLine(line)) return;
          line = normalizeLogLine(line);

          const stepMatch = line.match(/^step\s*(\d+)\s*[:\-]\s*(.+)$/i);
          if (stepMatch) {
            const number = Number(stepMatch[1]);
            const label = stepMatch[2].trim();
            if (!Number.isNaN(number)) {
              if (stepIndex.has(number)) {
                const idx = stepIndex.get(number);
                parsed.steps[idx] = { number, label };
              } else {
                stepIndex.set(number, parsed.steps.length);
                parsed.steps.push({ number, label });
              }
              parsed.currentStep = { number, label };
              return;
            }
          }

          if (lastInfo && lastInfo.text === line) {
            lastInfo.count += 1;
            return;
          }
          const infoEntry = { text: line, count: 1 };
          parsed.info.push(infoEntry);
          lastInfo = infoEntry;
        });

        return parsed;
      }

      function getStepState(index, total, status) {
        const isLast = index === total - 1;
        if (status === PIPELINE_STATUS.COMPLETED) return 'done';
        if (status === PIPELINE_STATUS.FAILED) return isLast ? 'failed' : 'done';
        if (status === PIPELINE_STATUS.RUNNING) return isLast ? 'current' : 'done';
        if (status === PIPELINE_STATUS.QUEUED) return 'pending';
        return isLast ? 'current' : 'done';
      }

      function formatStepSummary(parsed, status) {
        if (!parsed?.currentStep) return '';
        const label = `Step ${parsed.currentStep.number}: ${parsed.currentStep.label}`;
        if (status === PIPELINE_STATUS.COMPLETED) return `Last step: ${label}`;
        if (status === PIPELINE_STATUS.FAILED) return `Failed at: ${label}`;
        return `Current step: ${label}`;
      }

      function renderPipelineLogItems(parsed, status) {
        const items = [];
        const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
        const info = Array.isArray(parsed?.info) ? parsed.info : [];
        const normalized = normalizeStatus(status);

        steps.forEach((step, index) => {
          const state = getStepState(index, steps.length, normalized);
          const stateClass = state ? ` is-${state}` : '';
          const label = escapeHtml(step.label);
          const number = escapeHtml(step.number);
          const stateLabel = state === 'current'
            ? 'Current'
            : state === 'done'
              ? 'Completed'
              : state === 'failed'
                ? 'Failed'
                : 'Pending';
          const stateBadge = stateLabel ? `<span class="log-count">${stateLabel}</span>` : '';
          items.push(`
            <div class="log-item step-item${stateClass}">
              <div class="log-dot"></div>
              <div class="log-text">Step ${number}: ${label} ${stateBadge}</div>
            </div>
          `);
        });

        info.forEach((entry) => {
          const countBadge = entry.count > 1 ? `<span class="log-count">x${entry.count}</span>` : '';
          items.push(`
            <div class="log-item info-item">
              <div class="log-dot"></div>
              <div class="log-text">${escapeHtml(entry.text)} ${countBadge}</div>
            </div>
          `);
        });

        return { html: items.join(''), count: items.length };
      }

      function statusBadge(status) {
        const map = PIPELINE_BADGES;
        const normalized = normalizeStatus(status);
        const cls = map[normalized] || "secondary";
        return `<span class="badge bg-${cls}">${normalized}</span>`;
      }

      function loadFailureCache() {
        try {
          const raw = localStorage.getItem(failedRunsKey);
          if (!raw) return;
          const ids = JSON.parse(raw);
          if (Array.isArray(ids)) {
            ids.forEach(id => seenFailures.add(String(id)));
          }
        } catch (e) {
          // ignore invalid cache
        }
      }

      function persistFailureCache() {
        try {
          localStorage.setItem(failedRunsKey, JSON.stringify(Array.from(seenFailures)));
        } catch (e) {
          // ignore persistence errors
        }
      }

      function renderFailureAlert(failedRuns, newFailures) {
        const container = alertsEl();
        if (!container) return;
        if (!failedRuns.length) {
          container.innerHTML = '';
          return;
        }
        const newCount = newFailures.length;
        const totalCount = failedRuns.length;
        const focusRunId = String((newFailures[0] || failedRuns[0]).run_id || (newFailures[0] || failedRuns[0]).id || '');
        const actionButton = focusRunId
          ? `<button class="btn btn-sm btn-outline-light" data-action="focus-failure" data-run-id="${focusRunId}">
              View details
            </button>`
          : '';
        const title = newCount ? `New failures detected (${newCount})` : 'Failures detected';
        const subtitle = newCount
          ? `${newCount} pipeline(s) failed recently.`
          : `${totalCount} pipeline(s) failed.`;
        container.innerHTML = `
          <div class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
            <div>
              <div class="fw-semibold">${title}</div>
              <div class="small">${subtitle} Open details to view the log.</div>
            </div>
            ${actionButton}
          </div>
        `;
      }

      function updateFailureAlerts(runs) {
        if (!Array.isArray(runs)) return;
        const failedRuns = runs.filter(run => normalizeStatus(run.status) === PIPELINE_STATUS.FAILED);
        const newFailures = [];
        failedRuns.forEach(run => {
          const runId = String(run.run_id || run.id || '');
          if (!runId) return;
          if (!seenFailures.has(runId)) {
            seenFailures.add(runId);
            newFailures.push(run);
          }
        });
        if (newFailures.length) {
          persistFailureCache();
        }
        renderFailureAlert(failedRuns, newFailures);
      }

      function applyTrackerStatusStyle(status) {
        const el = statusEl();
        if (!el) return;
        el.classList.remove('text-primary', 'text-success', 'text-warning', 'text-danger', 'text-secondary');
        const normalized = normalizeStatus(status);
        const map = {
          running: 'text-primary',
          queued: 'text-warning',
          completed: 'text-success',
          failed: 'text-danger'
        };
        el.classList.add(map[normalized] || 'text-secondary');
      }

      function renderHealthUnavailable(message) {
        if (workerHealthStatusEl()) {
          workerHealthStatusEl().textContent = 'Unavailable';
          workerHealthStatusEl().className = 'fw-semibold text-danger';
        }
        if (workerHealthDetailEl()) workerHealthDetailEl().textContent = '';
        if (queueHealthStatusEl()) {
          queueHealthStatusEl().textContent = 'Unavailable';
          queueHealthStatusEl().className = 'fw-semibold text-danger';
        }
        if (queueHealthDetailEl()) queueHealthDetailEl().textContent = '';
        if (redisHealthStatusEl()) {
          redisHealthStatusEl().textContent = 'Unavailable';
          redisHealthStatusEl().className = 'fw-semibold text-danger';
        }
        if (redisHealthDetailEl()) redisHealthDetailEl().textContent = message || '';
        if (healthUpdatedEl()) healthUpdatedEl().textContent = 'Health check failed';
      }

      async function loadHealth() {
        try {
          const response = await fetch(ROUTES.PIPELINE_HEALTH || '/pipeline/health');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();

          const workerOnline = Boolean(data?.worker?.online);
          const workerAgeValue = Number(data?.worker?.ageSeconds);
          const workerAge = Number.isFinite(workerAgeValue) ? workerAgeValue : null;
          if (workerHealthStatusEl()) workerHealthStatusEl().textContent = workerOnline ? 'Online' : 'Offline';
          if (workerHealthStatusEl()) workerHealthStatusEl().className = `fw-semibold ${workerOnline ? 'text-success' : 'text-danger'}`;
          if (workerHealthDetailEl()) {
            const detail = workerAge !== null ? `Last heartbeat: ${workerAge}s` : 'No heartbeat';
            workerHealthDetailEl().textContent = detail;
          }

          const queueCounts = data?.queue?.counts || {};
          const queueOk = Boolean(data?.queue?.ok);
          if (queueHealthStatusEl()) queueHealthStatusEl().textContent = queueOk ? 'OK' : 'Offline';
          if (queueHealthStatusEl()) queueHealthStatusEl().className = `fw-semibold ${queueOk ? 'text-success' : 'text-danger'}`;
          if (queueHealthDetailEl()) {
            if (!queueOk) {
              queueHealthDetailEl().textContent = data?.queue?.error || '';
            } else {
              const waiting = Number(queueCounts.waiting || 0);
              const active = Number(queueCounts.active || 0);
              const failed = Number(queueCounts.failed || 0);
              queueHealthDetailEl().textContent = `Waiting: ${waiting} | Active: ${active} | Failed: ${failed}`;
            }
          }

          const redisOk = Boolean(data?.redis?.ok);
          if (redisHealthStatusEl()) redisHealthStatusEl().textContent = redisOk ? 'OK' : 'Offline';
          if (redisHealthStatusEl()) redisHealthStatusEl().className = `fw-semibold ${redisOk ? 'text-success' : 'text-danger'}`;
          if (redisHealthDetailEl()) redisHealthDetailEl().textContent = redisOk ? 'Connected' : (data?.redis?.error || '');

          if (healthUpdatedEl()) {
            const updated = data?.time ? new Date(data.time) : new Date();
            healthUpdatedEl().textContent = `Updated: ${updated.toLocaleTimeString()}`;
          }
        } catch (err) {
          renderHealthUnavailable('Failed to fetch');
        }
      }

      async function resolveAuth() {
        if (typeof getAuthStatus !== 'function') return;
        try {
          const status = await getAuthStatus();
          isAdminUser = Boolean(status?.isAdmin);
        } catch (e) {
          isAdminUser = false;
        }

        const header = runsUserHeaderEl();
        if (header) {
          header.classList.toggle('d-none', !isAdminUser);
        }
        const userFilterGroup = userFilterGroupEl();
        if (userFilterGroup) {
          userFilterGroup.classList.toggle('d-none', !isAdminUser);
        }
        const clearUploadsBtn = document.getElementById('clearUploadsBtn');
        if (clearUploadsBtn) {
          clearUploadsBtn.classList.toggle('d-none', !isAdminUser);
        }
      }

      function getSavedRunId() {
        try {
          const saved = localStorage.getItem(lastRunKey);
          if (!saved) return null;
          const data = JSON.parse(saved);
          return data?.runId || null;
        } catch (e) {
          return null;
        }
      }

      function stopAutoRefresh() {
        if (tracker.intervalId) {
          clearInterval(tracker.intervalId);
          tracker.intervalId = null;
        }
      }

      function startAutoRefresh() {
        stopAutoRefresh();
        if (!tracker.autoRefresh) return;
        const pollSeconds = getPollSeconds();
        tracker.intervalId = setInterval(() => {
          loadRuns();
          if (tracker.runId) fetchStatus();
        }, pollSeconds * 1000);
      }

      function setAutoRefresh(enabled) {
        tracker.autoRefresh = enabled;
        const label = document.getElementById('autoRefreshLabel');
        const icon = document.getElementById('autoRefreshIcon');
        if (label) label.textContent = enabled ? 'Pause refresh' : 'Resume refresh';
        if (icon) icon.textContent = enabled ? 'pause_circle' : 'play_circle';
        if (enabled) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      }

      function highlightSelectedRun() {
        const body = runsBodyEl();
        if (!body) return;
        body.querySelectorAll('tr[data-run-id]').forEach((row) => {
          row.classList.toggle("table-active", row.dataset.runId === tracker.runId);
        });
      }

      function renderRuns(runs, emptyMessage, pagination) {
        const body = runsBodyEl();
        if (!body) return;
        const columnCount = isAdminUser ? 5 : 4;
        const totalRecords = Number(pagination?.totalRecords ?? runs?.length ?? 0);

        if (!Array.isArray(runs) || runs.length === 0) {
          const message = emptyMessage || NO_PIPELINES_MESSAGE;
          body.innerHTML = `<tr><td colspan="${columnCount}" class="text-center">${message}</td></tr>`;
          if (runsCountEl()) runsCountEl().textContent = `${totalRecords} pipeline(s)`;
          highlightSelectedRun();
          return;
        }

        body.innerHTML = runs.map((run) => {
          const type = String(run.pipeline_type || run.pipelineType || "default").toUpperCase();
          const status = normalizeStatus(run.status);
          const createdAt = formatDate(run.created_at || run.createdAt);
          const userLabel = run.user_email || run.userEmail || '-';
          const userCell = isAdminUser ? `<td>${userLabel}</td>` : '';
          const rowClass = status === PIPELINE_STATUS.FAILED ? 'table-danger' : '';
          const allowCancel = canCancelStatus(status);
          const cancelLabel = status === PIPELINE_STATUS.RUNNING ? 'Request cancel' : 'Cancel';
          const cancelButton = allowCancel
            ? `<button class="btn btn-sm btn-outline-danger" data-action="cancel" data-run-id="${run.run_id}" data-status="${status}">
                ${cancelLabel}
              </button>`
            : '';
          return `
            <tr data-run-id="${run.run_id}" class="${rowClass}">
              <td>${type}</td>
              ${userCell}
              <td>${statusBadge(status)}</td>
              <td>${createdAt}</td>
              <td>
                <div class="d-flex flex-wrap gap-2">
                  <button class="btn btn-sm btn-outline-primary" data-action="details" data-run-id="${run.run_id}">
                    Details
                  </button>
                  ${cancelButton}
                </div>
              </td>
            </tr>
          `;
        }).join("");

        if (runsCountEl()) runsCountEl().textContent = `${totalRecords} pipeline(s)`;
        highlightSelectedRun();
      }

      function maybeAutoSelect(runs) {
        if (tracker.runId) return;
        if (!Array.isArray(runs) || runs.length === 0) return;

        const savedRunId = getSavedRunId();
        const savedMatch = savedRunId ? runs.find(r => r.run_id === savedRunId) : null;
        if (savedMatch) {
          selectRun(savedRunId, false);
          return;
        }

        if (!tracker.manualSelection) {
          selectRun(runs[0].run_id, false);
        }
      }

      function renderRunsPagetion(pagination) {
        const container = document.getElementById('runsPagetion');
        if (!container) return;

        const totalRecords = Number(pagination?.totalRecords || 0);
        const totalPages = Math.max(Number(pagination?.totalPages || 0), 1);
        const currentPage = Math.min(Math.max(Number(pagination?.currentPage || 1), 1), totalPages);
        const limit = Number(pagination?.limit || runsState.limit);
        const start = totalRecords === 0 ? 0 : ((currentPage - 1) * limit) + 1;
        const end = totalRecords === 0 ? 0 : Math.min(currentPage * limit, totalRecords);

        container.innerHTML = `
          <div class="small text-muted">
            ${totalRecords ? `Showing ${start} - ${end} of ${totalRecords}` : 'No results'}
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-primary" ${currentPage <= 1 ? 'disabled' : ''} onclick="goToRunsPage(${currentPage - 1})">
              Previous
            </button>
            <span class="small text-muted">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-sm btn-outline-primary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="goToRunsPage(${currentPage + 1})">
              Next
            </button>
          </div>
        `;
      }

      function goToRunsPage(page) {
        const target = Number(page);
        if (!Number.isFinite(target)) return;
        if (target < 1 || target > runsState.totalPages) return;
        runsState.page = target;
        loadRuns();
      }

      async function loadRuns() {
        const body = runsBodyEl();
        if (body) {
          const columnCount = isAdminUser ? 5 : 4;
          body.innerHTML = `<tr><td colspan="${columnCount}" class="text-center">${LOADING_MESSAGE}</td></tr>`;
        }

        const statusFilter = statusFilterEl()?.value || 'all';
        const dateFrom = dateFromEl()?.value || '';
        const dateTo = dateToEl()?.value || '';
        const userFilter = isAdminUser ? (userFilterEl()?.value || '').trim() : '';
        const sortBy = sortByEl()?.value || '';
        const sortOrder = sortOrderEl()?.value || '';

        if (runsSubtitleEl()) {
          const statusLabelMap = PIPELINE_LABELS;
          const parts = [];
          if (statusFilter && statusFilter !== 'all') {
            parts.push(`Status: ${statusLabelMap[statusFilter] || statusFilter}`);
          } else {
            parts.push('Showing all');
          }
          if (dateFrom || dateTo) {
            const range = `${dateFrom || '...'} - ${dateTo || '...'}`;
            parts.push(`Date: ${range}`);
          }
          if (userFilter) {
            parts.push(`User: ${userFilter}`);
          }
          runsSubtitleEl().textContent = parts.join(' | ');
        }

        try {
          const queryParams = new URLSearchParams({
            page: runsState.page,
            limit: runsState.limit
          });
          if (statusFilter && statusFilter !== 'all') {
            queryParams.set('status', statusFilter);
          }
          if (dateFrom) queryParams.set('from', dateFrom);
          if (dateTo) queryParams.set('to', dateTo);
          if (userFilter) queryParams.set('user', userFilter);
          if (sortBy) queryParams.set('sort', sortBy);
          if (sortOrder) queryParams.set('order', sortOrder);
          const response = await fetch(`${ROUTES.PIPELINE_RUNS || '/pipeline/runs'}?${queryParams}`);
          if (response.status === 401 || response.status === 403) {
            renderRuns([], NO_ACCESS_MESSAGE);
            renderRunsPagetion({ currentPage: runsState.page, totalPages: 1, totalRecords: 0, limit: runsState.limit });
            return;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          let runs = Array.isArray(data.runs) ? data.runs : [];
          const pagination = data.pagination || {
            currentPage: runsState.page,
            totalPages: 1,
            totalRecords: runs.length,
            limit: runsState.limit
          };

          if (pagination.totalPages > 0 && runsState.page > pagination.totalPages) {
            runsState.page = pagination.totalPages;
            loadRuns();
            return;
          }

          runsState.totalPages = Math.max(Number(pagination.totalPages || 1), 1);
          runsState.totalRecords = Number(pagination.totalRecords || runs.length);
          if (runsState.totalRecords === 0) {
            runsState.page = 1;
          }

          if (tracker.runId && !runs.some(run => run.run_id === tracker.runId)) {
            tracker.runId = null;
            tracker.manualSelection = false;
            resetTrackerUI('Select a pipeline to view details.');
          }

          if (runs.length === 0) {
            const message = statusFilter && statusFilter !== 'all'
              ? 'No pipelines found for this filter.'
              : NO_PIPELINES_MESSAGE;
            renderRuns([], message, pagination);
            updateFailureAlerts([]);
          } else {
            renderRuns(runs, null, pagination);
            updateFailureAlerts(runs);
          }
          renderRunsPagetion(pagination);
          maybeAutoSelect(runs);
          loadHealth();
        } catch (err) {
          renderRuns([], 'Failed to load pipelines.');
          renderRunsPagetion({ currentPage: runsState.page, totalPages: 1, totalRecords: 0, limit: runsState.limit });
          if (runsSubtitleEl()) runsSubtitleEl().textContent = 'Status unavailable';
          renderFailureAlert([], []);
          renderHealthUnavailable('Status unavailable');
        }
      }

      function selectRun(runId, manual = true) {
        if (!runId) return;
        tracker.runId = runId;
        if (manual) tracker.manualSelection = true;

        if (trackerBox()) trackerBox().style.display = "block";
        if (statusEl()) statusEl().textContent = LOADING_MESSAGE;
        if (updatedEl()) updatedEl().textContent = "Waiting for status...";
        if (messageEl()) messageEl().textContent = "";
        if (runEl()) runEl().textContent = "";
        if (jobEl()) jobEl().textContent = "";
        if (typeEl()) typeEl().textContent = "";
        if (queueEl()) queueEl().textContent = "";
        if (stepEl()) stepEl().textContent = "";
        if (logsEl()) logsEl().innerHTML = "";
        if (logsCountEl()) logsCountEl().textContent = "";
        highlightSelectedRun();
        fetchStatus();
      }

      async function cancelRun(runId, status, button) {
        if (!runId) return;
        const normalizedStatus = normalizeStatus(status);
        const isRunning = normalizedStatus === PIPELINE_STATUS.RUNNING;
        const confirmMessage = isRunning
          ? 'This pipeline is running. Request cancellation? It may take a while to stop.'
          : 'Cancel this queued pipeline?';
        if (!window.confirm(confirmMessage)) return;

        const originalLabel = button?.textContent?.trim();
        if (button) {
          button.disabled = true;
          button.textContent = 'Canceling...';
        }

        try {
          const response = await fetch(`${PIPELINE_CANCEL_ROUTE}/${runId}`, { method: 'POST' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.success === false) {
            alert(payload?.error || 'Failed to cancel pipeline.');
            return;
          }
          alert(payload?.message || 'Pipeline canceled.');
          loadRuns();
          if (tracker.runId === runId) fetchStatus();
        } catch (err) {
          alert('Failed to cancel pipeline.');
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = originalLabel || (isRunning ? 'Request cancel' : 'Cancel');
          }
        }
      }

      async function fetchStatus() {
        if (!tracker.runId) return;
        try {
          const response = await fetch(`${ROUTES.PIPELINE_STATUS || '/pipeline/status'}/${tracker.runId}`);
          if (response.status === 404) {
            resetTrackerUI('Pipeline not found.');
            tracker.runId = null;
            return;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!data.success || !data.run) throw new Error(data.error || "Status unavailable");

          const run = data.run;
          const status = normalizeStatus(run.status);
          const started = run.started_at || run.startedAt;
          const finished = run.finished_at || run.finishedAt;
          const errorMessage = run.error_message || run.errorMessage;
          const queueInfo = data.queue || null;

          if (statusEl()) statusEl().textContent = status;
          applyTrackerStatusStyle(status);
          if (updatedEl()) updatedEl().textContent = `Updated: ${new Date().toLocaleTimeString()}`;
          const pipelineType = run.pipeline_type || run.pipelineType;
          const createdAt = run.created_at || run.createdAt;
          if (typeEl()) typeEl().textContent = pipelineType ? String(pipelineType).toUpperCase() : "";
          if (runEl()) runEl().textContent = createdAt ? `Created at: ${formatDate(createdAt)}` : "";
          if (jobEl()) jobEl().textContent = "";
          if (queueEl()) {
            if (queueInfo && queueInfo.state) {
              const hasPosition = Number.isInteger(queueInfo.position) && queueInfo.position >= 0;
              const positionText = hasPosition ? ` (position ${queueInfo.position + 1})` : "";
              queueEl().textContent = `Queue: ${queueInfo.state}${positionText}`;
            } else {
              queueEl().textContent = "";
            }
          }
          const logs = Array.isArray(run.logs) ? run.logs : [];
          const parsedLogs = parsePipelineLogs(logs);
          const renderedLogs = renderPipelineLogItems(parsedLogs, status);
          if (logsCountEl()) logsCountEl().textContent = renderedLogs.count ? `${renderedLogs.count} events` : 'No events';
          if (logsEl()) {
            logsEl().innerHTML = renderedLogs.html || "<div class=\"text-muted small py-2\">No logs yet.</div>";
          }
          if (stepEl()) {
            const summary = formatStepSummary(parsedLogs, status);
            stepEl().textContent = summary;
            stepEl().className = 'small text-muted';
            if (summary) {
              if (status === PIPELINE_STATUS.FAILED) {
                stepEl().className = 'small text-danger';
              } else if (status === PIPELINE_STATUS.COMPLETED) {
                stepEl().className = 'small text-success';
              } else if (status === PIPELINE_STATUS.RUNNING) {
                stepEl().className = 'small text-primary';
              }
            }
          }

          if (messageEl()) {
            messageEl().classList.remove('text-danger', 'text-success', 'text-warning', 'text-primary');
            if (status === PIPELINE_STATUS.FAILED && errorMessage) {
              messageEl().classList.add('text-danger');
              messageEl().textContent = `Error: ${errorMessage}`;
              updateFailureAlerts([run]);
            } else if (status === PIPELINE_STATUS.RUNNING && started) {
              messageEl().classList.add('text-primary');
              messageEl().textContent = `Started at: ${formatDate(started)}`;
            } else if (status === PIPELINE_STATUS.COMPLETED && finished) {
              messageEl().classList.add('text-success');
              messageEl().textContent = `Finished at: ${formatDate(finished)}`;
            } else if (status === PIPELINE_STATUS.QUEUED) {
              messageEl().classList.add('text-warning');
              messageEl().textContent = 'Queued';
            } else {
              messageEl().textContent = "";
            }
          }
        } catch (err) {
          if (updatedEl()) updatedEl().textContent = "Status unavailable";
          if (messageEl()) messageEl().textContent = `Failed to fetch status: ${err.message}`;
        }
      }

      function resetTrackerUI(message) {
        if (trackerBox()) trackerBox().style.display = "none";
        if (statusEl()) statusEl().textContent = "-";
        applyTrackerStatusStyle('unknown');
        if (updatedEl()) updatedEl().textContent = "";
        if (messageEl()) messageEl().textContent = message || "";
        if (queueEl()) queueEl().textContent = "";
        if (stepEl()) stepEl().textContent = "";
        if (logsEl()) logsEl().innerHTML = "";
        if (logsCountEl()) logsCountEl().textContent = "";
      }

      document.addEventListener("DOMContentLoaded", async () => {
        loadFailureCache();

        const alertContainer = alertsEl();
        if (alertContainer && !alertContainer.dataset.bound) {
          alertContainer.dataset.bound = 'true';
          alertContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action="focus-failure"]');
            if (!button) return;
            const runId = button.dataset.runId;
            if (runId) selectRun(runId, true);
          });
        }

        const body = runsBodyEl();
        if (body) {
          body.addEventListener("click", (event) => {
            const cancelButton = event.target.closest("[data-action=\"cancel\"]");
            if (cancelButton) {
              cancelRun(cancelButton.dataset.runId, cancelButton.dataset.status, cancelButton);
              return;
            }
            const button = event.target.closest("[data-action=\"details\"]");
            if (!button) return;
            selectRun(button.dataset.runId, true);
          });
        }

        const refreshBtn = document.getElementById('refreshRunsBtn');
        if (refreshBtn) {
          refreshBtn.addEventListener("click", () => {
            loadRuns();
            if (tracker.runId) fetchStatus();
          });
        }

        const toggleBtn = document.getElementById('toggleAutoRefreshBtn');
        if (toggleBtn) {
          toggleBtn.addEventListener("click", () => setAutoRefresh(!tracker.autoRefresh));
        }

        const pollInput = document.getElementById('pollInterval');
        if (pollInput) {
          pollInput.addEventListener("change", () => {
            if (tracker.autoRefresh) startAutoRefresh();
          });
        }

        const statusFilter = statusFilterEl();
        if (statusFilter) {
          statusFilter.addEventListener('change', () => {
            runsState.page = 1;
            loadRuns();
          });
        }

        const dateFrom = dateFromEl();
        if (dateFrom) {
          dateFrom.addEventListener('change', () => {
            runsState.page = 1;
            loadRuns();
          });
        }

        const dateTo = dateToEl();
        if (dateTo) {
          dateTo.addEventListener('change', () => {
            runsState.page = 1;
            loadRuns();
          });
        }

        const sortBy = sortByEl();
        if (sortBy) {
          sortBy.addEventListener('change', () => {
            runsState.page = 1;
            loadRuns();
          });
        }

        const sortOrder = sortOrderEl();
        if (sortOrder) {
          sortOrder.addEventListener('change', () => {
            runsState.page = 1;
            loadRuns();
          });
        }

        const userFilter = userFilterEl();
        if (userFilter) {
          let userFilterTimeout;
          userFilter.addEventListener('input', () => {
            clearTimeout(userFilterTimeout);
            userFilterTimeout = setTimeout(() => {
              runsState.page = 1;
              loadRuns();
            }, 400);
          });
        }

        const clearUploadsBtn = document.getElementById('clearUploadsBtn');
        if (clearUploadsBtn) {
          clearUploadsBtn.addEventListener('click', async () => {
            if (!isAdminUser) return;
            const confirmed = window.confirm('Remove all uploads stored on the server?');
            if (!confirmed) return;
            clearUploadsBtn.disabled = true;
            try {
              const response = await fetch(ROUTES.UPLOAD_CLEANUP || '/upload/admin/cleanup', { method: 'DELETE' });
              if (!response.ok) {
                const payload = await response.json().catch(() => null);
                const message = payload?.error || 'Failed to clear uploads.';
                alert(message);
                return;
              }
              const payload = await response.json().catch(() => ({}));
              alert(`Uploads removed: ${payload.removed || 0}`);
            } catch (err) {
              alert('Failed to clear uploads.');
            } finally {
              clearUploadsBtn.disabled = false;
            }
          });
        }

        await resolveAuth();
        loadHealth();
        loadRuns();
        startAutoRefresh();
      });
})();
