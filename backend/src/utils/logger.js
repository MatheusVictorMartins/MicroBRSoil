const fs = require('fs');
const path = require('path');

/**
 * Comprehensive logging utility for MicroBRSoil
 * Supports multiple log levels and automatic log rotation
 */
class Logger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'microbrsoil';
    this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.logDir = options.logDir || process.env.LOG_DIR || '/app/logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    // Log levels with priority (lower number = higher priority)
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    // Ensure log directory exists
    this.ensureLogDir();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get current timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Get caller information for better debugging
   */
  getCallerInfo() {
    const err = new Error();
    const stack = err.stack.split('\n');
    
    // Find the first stack frame that's not this logger
    for (let i = 2; i < stack.length; i++) {
      const line = stack[i];
      if (!line.includes('logger.js') && !line.includes('Logger.')) {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) || 
                     line.match(/at\s+(.+?):(\d+):(\d+)/);
        if (match) {
          return {
            function: match[1] || 'anonymous',
            file: path.basename(match[2] || 'unknown'),
            line: match[3] || 'unknown'
          };
        }
      }
    }
    
    return { function: 'unknown', file: 'unknown', line: 'unknown' };
  }

  /**
   * Format log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const caller = this.getCallerInfo();
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: this.serviceName,
      message,
      caller: `${caller.file}:${caller.line}:${caller.function}`,
      pid: process.pid,
      ...meta
    };

    return JSON.stringify(logEntry);
  }

  /**
   * Check if message should be logged based on log level
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * Get log file path for a specific level
   */
  getLogFilePath(level) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${this.serviceName}-${level}-${date}.log`);
  }

  /**
   * Rotate log file if it exceeds max size
   */
  rotateLogFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const stats = fs.statSync(filePath);
    if (stats.size < this.maxFileSize) return;

    // Find next available rotation number
    let rotationNum = 1;
    let rotatedPath;
    
    do {
      rotatedPath = `${filePath}.${rotationNum}`;
      rotationNum++;
    } while (fs.existsSync(rotatedPath) && rotationNum <= this.maxFiles);

    // If we've exceeded max files, remove the oldest
    if (rotationNum > this.maxFiles) {
      const oldestFile = `${filePath}.${this.maxFiles}`;
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }
      
      // Shift all files down
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const current = `${filePath}.${i}`;
        const next = `${filePath}.${i + 1}`;
        if (fs.existsSync(current)) {
          fs.renameSync(current, next);
        }
      }
      rotatedPath = `${filePath}.1`;
    }

    // Rotate current file
    fs.renameSync(filePath, rotatedPath);
  }

  /**
   * Write log message to file
   */
  writeToFile(level, formattedMessage) {
    const filePath = this.getLogFilePath(level);
    
    try {
      // Check for log rotation
      this.rotateLogFile(filePath);
      
      // Append to log file
      fs.appendFileSync(filePath, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Always log to console in development
    if (process.env.NODE_ENV !== 'production') {
      const colors = {
        error: '\x1b[31m', // Red
        warn: '\x1b[33m',  // Yellow
        info: '\x1b[36m',  // Cyan
        debug: '\x1b[35m', // Magenta
        trace: '\x1b[37m'  // White
      };
      const reset = '\x1b[0m';
      console.log(`${colors[level] || ''}[${level.toUpperCase()}]${reset} ${message}`);
      if (Object.keys(meta).length > 0) {
        console.log('Meta:', meta);
      }
    }

    // Write to appropriate log files
    this.writeToFile(level, formattedMessage);
    
    // Also write error and warn to combined log
    if (level === 'error' || level === 'warn') {
      this.writeToFile('combined', formattedMessage);
    }
  }

  /**
   * Log level methods
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  /**
   * Log HTTP requests (Express middleware)
   */
  httpMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      // Log request
      this.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        requestId: req.id || Math.random().toString(36).substr(2, 9)
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - start;
        
        const logger = req.logger || global.logger;
        if (logger) {
          logger.info('HTTP Response', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            requestId: req.id || 'unknown'
          });
        }

        originalEnd.apply(this, args);
      };

      next();
    };
  }

  /**
   * Create child logger with additional context
   */
  child(meta = {}) {
    const childLogger = Object.create(this);
    childLogger.defaultMeta = { ...(this.defaultMeta || {}), ...meta };
    
    // Override log method to include default meta
    childLogger.log = (level, message, additionalMeta = {}) => {
      const combinedMeta = { ...childLogger.defaultMeta, ...additionalMeta };
      return this.log.call(this, level, message, combinedMeta);
    };
    
    return childLogger;
  }
}

// Create default logger instances for different services
const createLogger = (serviceName) => {
  return new Logger({ serviceName });
};

// Export both the class and factory function
module.exports = {
  Logger,
  createLogger,
  // Default loggers for each service
  apiLogger: createLogger('api'),
  workerLogger: createLogger('worker'),
  dbLogger: createLogger('database')
};
