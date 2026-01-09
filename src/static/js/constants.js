(function (global) {
  const existing = global.APP_CONSTANTS || {};

  const ROUTES = {
    AUTH_LOGIN: "/login",
    AUTH_LOGIN_API: "/auth/login",
    AUTH_LOGOUT: "/auth/logout",
    AUTH_REFRESH: "/auth/refresh",
    AUTH_STATUS: "/auth/status",
    PIPELINE_HEALTH: "/pipeline/health",
    PIPELINE_RUNS: "/pipeline/runs",
    PIPELINE_STATUS: "/pipeline/status",
    PIPELINE_STATUS_PAGE: "/pipeline-status",
    PIPELINE_CANCEL: "/pipeline/cancel",
    PIPELINE_STATS: "/api/table/stats",
    UPLOAD_ILLUMINA: "/upload/illumina",
    UPLOAD_IONTORRENT: "/upload/iontorrent",
    UPLOAD_ITS: "/upload/its",
    UPLOAD_CLEANUP: "/upload/admin/cleanup",
    UPLOAD_FILES: "/upload/files",
    UPLOAD_DOWNLOAD: "/upload/download",
    RESULTS_FILES: "/results/files",
    RESULTS_DOWNLOAD: "/results/download",
    TABLE_BASE: "/api/table",
    TABLE_SOIL: "/api/table/soil",
    TABLE_SOIL_FILTERS: "/api/table/soil/filters",
    TABLE_SOIL_DETAIL: "/api/table/soil",
    TABLE_PIPELINE_RESULTS: "/api/table/pipeline-results"
  };

  const ROLES = {
    ADMIN_VALUES: ["admin", "ADMIN", "1", 1]
  };

  const STATUS = {
    PIPELINE: {
      QUEUED: "queued",
      RUNNING: "running",
      COMPLETED: "completed",
      FAILED: "failed",
      ACTIVE: "active"
    },
    PIPELINE_BADGES: {
      queued: "warning",
      running: "primary",
      completed: "success",
      failed: "danger"
    },
    PIPELINE_LABELS: {
      active: "In progress",
      all: "All",
      queued: "Queued",
      running: "Running",
      completed: "Completed",
      failed: "Failed"
    }
  };

  const MESSAGES = {
    LOADING: "Loading...",
    NO_PIPELINES: "No pipelines found.",
    NO_ACCESS_PIPELINES: "Access denied. Log in to view pipelines.",
    UPLOAD_SUCCESS: "Upload sent successfully.",
    UPLOAD_ERROR: "Upload failed.",
    LOGIN_REQUIRED_UPLOAD: "Log in or create an account to upload files and run pipelines."
  };

  const merge = (base, incoming) => Object.assign({}, base || {}, incoming || {});

  global.APP_CONSTANTS = {
    ROUTES: merge(existing.ROUTES, ROUTES),
    ROLES: merge(existing.ROLES, ROLES),
    STATUS: merge(existing.STATUS, STATUS),
    MESSAGES: merge(existing.MESSAGES, MESSAGES)
  };
})(window);
