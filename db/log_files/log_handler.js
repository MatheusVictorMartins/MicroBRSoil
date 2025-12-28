const path = require('path');

// Try multiple logger locations: Docker path first, then local backend path, then console fallback
const tryRequire = (p) => {
    try { return require(p); } catch (err) { return null; }
};

const loggerModule =
    tryRequire('/app/src/utils/logger') ||
    tryRequire(path.join(__dirname, '../../backend/src/utils/logger'));

const dbLogger = loggerModule?.dbLogger || {
    info: console.log,
    warn: console.warn,
    error: console.error
};

const LEVEL_MAP = {
    ERROR: 'error',
    WARN: 'warn',
    WARNING: 'warn',
    INFO: 'info',
    SUCCESS: 'info'
};

const parseLogMessage = (message) => {
    const match = message.match(/\[(ERROR|WARN|WARNING|INFO|SUCCESS)\]/i);
    if (!match) return { level: null, text: message };
    const levelKey = match[1].toUpperCase();
    const level = LEVEL_MAP[levelKey] || 'info';
    const text = message.replace(match[0], '').trim();
    return { level, text };
};

// Legacy compatibility wrapper for existing database logging
const writeLog = (message, meta = {}) => {
    if (!message || typeof message !== "string") {
        dbLogger.warn('Invalid log message format', {
            messageType: typeof message,
            messageValue: message
        });
        return;
    }

    const trimmed = message.startsWith('\n') ? message.substring(1) : message;
    const { level, text } = parseLogMessage(trimmed);
    const finalLevel = (meta && meta.level) ? meta.level : (level || 'info');
    const cleanMeta = { ...(meta || {}) };
    delete cleanMeta.level;
    const method = (finalLevel && typeof dbLogger[finalLevel] === 'function')
        ? finalLevel
        : 'info';
    dbLogger[method](text, cleanMeta);
};

module.exports = writeLog;
module.exports.dbLogger = dbLogger;
