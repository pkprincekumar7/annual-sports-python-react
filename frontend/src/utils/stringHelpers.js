/**
 * String Helper Functions (Frontend)
 * Utility functions for string formatting operations
 */

/**
 * Capitalize the first letter of each word in a string
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string (e.g., "cricket" -> "Cricket", "table tennis" -> "Table Tennis")
 */
export function capitalizeWords(str) {
  if (!str || typeof str !== 'string') {
    return str
  }
  
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Format sport name for display (capitalize each word)
 * @param {string} sportName - The sport name (usually lowercase from database)
 * @returns {string} The formatted sport name with proper capitalization
 */
export function formatSportName(sportName) {
  return capitalizeWords(sportName)
}

