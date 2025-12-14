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

// Legacy compatibility wrapper for existing database logging
const writeLog = (message) => {
    if (!message || typeof message !== "string") {
        dbLogger.warn('Invalid log message format', {
            messageType: typeof message,
            messageValue: message
        });
        return;
    }

    const cleanMessage = message.startsWith('\n') ? message.substring(1) : message;
    dbLogger.info(cleanMessage);
};

module.exports = writeLog;
module.exports.dbLogger = dbLogger;
