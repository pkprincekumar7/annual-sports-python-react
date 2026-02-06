/**
 * Error Handling Utilities
 * Centralized error handling and status popup message formatting
 */

/**
 * Extract error message from error object
 * @param {Error|Object} error - Error object from API or exception
 * @param {string} defaultMessage - Default error message if none found
 * @returns {string} Error message
 */
export function extractErrorMessage(error, defaultMessage = 'An unexpected error occurred. Please try again.') {
  if (!error) return defaultMessage
  
  // Check for error message in various formats
  if (error.message) return error.message
  if (error.error) return error.error
  if (typeof error === 'string') return error
  
  // Check for API response error format
  if (error.response?.data?.error) return error.response.data.error
  if (error.response?.data?.message) return error.response.data.message
  
  return defaultMessage
}

/**
 * Format error message for status popup
 * @param {Error|Object|string} error - Error object or message
 * @param {string} defaultMessage - Default error message
 * @returns {string} Formatted error message with emoji
 */
export function formatErrorMessage(error, defaultMessage = 'An unexpected error occurred. Please try again.') {
  const message = extractErrorMessage(error, defaultMessage)
  return message.startsWith('❌') ? message : `❌ ${message}`
}

/**
 * Format success message for status popup
 * @param {string} message - Success message
 * @returns {string} Formatted success message with emoji
 */
export function formatSuccessMessage(message) {
  return message.startsWith('✅') ? message : `✅ ${message}`
}

/**
 * Create a standardized error handler for useApi hook
 * @param {Function} onStatusPopup - Status popup callback function
 * @param {string} defaultMessage - Default error message
 * @returns {Object} { onError: Function }
 */
export function createErrorHandler(onStatusPopup, defaultMessage = 'An unexpected error occurred. Please try again.') {
  return {
    onError: (err) => {
      const errorMessage = extractErrorMessage(err, defaultMessage)
      if (onStatusPopup) {
        onStatusPopup(formatErrorMessage(errorMessage), 'error', 4000)
      }
    }
  }
}

/**
 * Create a standardized success handler for useApi hook
 * @param {Function} onStatusPopup - Status popup callback function
 * @param {string} message - Success message
 * @param {Function} onSuccess - Additional success callback (optional)
 * @returns {Object} { onSuccess: Function }
 */
export function createSuccessHandler(onStatusPopup, message, onSuccess = null) {
  return {
    onSuccess: (data) => {
      if (onStatusPopup) {
        onStatusPopup(formatSuccessMessage(message), 'success', 2500)
      }
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(data)
      }
    }
  }
}

