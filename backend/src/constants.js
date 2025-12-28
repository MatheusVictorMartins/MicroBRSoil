const ROLES = {
  ADMIN_VALUES: ['admin', 'ADMIN', 1, '1'],
  ADMIN_ROLE_ID: 1
};

const PIPELINE_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ACTIVE: 'active'
};

const RATE_LIMIT_MESSAGES = {
  PIPELINE_STATUS: 'Too many pipeline status requests. Please slow down.',
  PIPELINE_SUBMISSIONS: 'Too many pipeline submissions. Please try again later.',
  UPLOADS: 'Too many uploads. Please try again later.',
  TABLE_READ: 'Too many table requests. Please slow down.',
  TABLE_WRITE: 'Too many write requests. Please slow down.'
};

module.exports = {
  ROLES,
  PIPELINE_STATUS,
  RATE_LIMIT_MESSAGES
};
