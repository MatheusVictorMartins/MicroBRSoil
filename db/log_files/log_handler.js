const { dbLogger } = require('/app/src/utils/logger');

// Legacy compatibility wrapper for existing database logging
// This maintains backward compatibility while using the new logging system
const writeLog = (message) => {
    if (!message || typeof message !== "string") {
        dbLogger.warn('Invalid log message format', { 
            messageType: typeof message,
            messageValue: message 
        });
        return;
    }

    // Remove the old format requirement and log directly
    const cleanMessage = message.startsWith('\n') ? message.substring(1) : message;
    
    // Use the new logging system with database logger
    dbLogger.info(cleanMessage);
}

// Export both the legacy function and new logger for gradual migration
module.exports = writeLog;
module.exports.dbLogger = dbLogger;