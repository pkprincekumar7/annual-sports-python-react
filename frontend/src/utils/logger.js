// Logging utility for production-ready error handling
// In production, only errors are logged. In development, verbose logs can be disabled.

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

// Set to false to disable verbose API/debug logs even in development
// Set via localStorage: localStorage.setItem('enableVerboseLogs', 'true')
const enableVerboseLogs = isDevelopment && 
  (localStorage.getItem('enableVerboseLogs') === 'true' || 
   localStorage.getItem('enableVerboseLogs') === null) // Default to true in dev

const logger = {
  /**
   * Log debug information (only in development, and only if verbose logs enabled)
   */
  debug: (...args) => {
    if (isDevelopment && enableVerboseLogs) {
      console.log('[DEBUG]', ...args)
    }
  },

  /**
   * Log informational messages (only in development, and only if verbose logs enabled)
   */
  info: (...args) => {
    if (isDevelopment && enableVerboseLogs) {
      console.info('[INFO]', ...args)
    }
  },

  /**
   * Log warnings (always logged in development)
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args)
    }
  },

  /**
   * Log errors (always logged, even in production)
   * In production, you might want to send these to an error tracking service
   */
  error: (...args) => {
    if (isDevelopment) {
      console.error('[ERROR]', ...args)
    } else {
      // In production, you could send errors to a logging service
      // Example: sendToErrorTrackingService(...args)
      console.error('[ERROR]', ...args) // Still log errors in production for debugging
    }
  },

  /**
   * Log API-related debug information (only in development, and only if verbose logs enabled)
   * Use sparingly - these can be very verbose
   */
  api: (...args) => {
    if (isDevelopment && enableVerboseLogs) {
      console.log('[API]', ...args)
    }
  },
}

export default logger

