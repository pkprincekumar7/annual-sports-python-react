/**
 * Date Formatting Utilities
 * Helper functions for formatting dates in various formats
 */

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 * @param {number} n - The number
 * @returns {string} The ordinal suffix
 */
function getOrdinalSuffix(n) {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) {
    return n + 'st'
  }
  if (j === 2 && k !== 12) {
    return n + 'nd'
  }
  if (j === 3 && k !== 13) {
    return n + 'rd'
  }
  return n + 'th'
}

/**
 * Format a date range for display (e.g., "9th Jan 2026 to 13th Jan 2026")
 * @param {string|Date} startDate - Start date (ISO string or Date object)
 * @param {string|Date} endDate - End date (ISO string or Date object)
 * @returns {string} Formatted date range string
 */
export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return ''

  const start = new Date(startDate)
  const end = new Date(endDate)

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const startDay = getOrdinalSuffix(start.getDate())
  const startMonth = monthNames[start.getMonth()]
  const startYear = start.getFullYear()

  const endDay = getOrdinalSuffix(end.getDate())
  const endMonth = monthNames[end.getMonth()]
  const endYear = end.getFullYear()

  // If same month and year, only show month once
  if (startMonth === endMonth && startYear === endYear) {
    return `${startDay} ${startMonth} ${startYear} to ${endDay} ${endMonth} ${endYear}`
  }

  // If same year but different months
  if (startYear === endYear) {
    return `${startDay} ${startMonth} to ${endDay} ${endMonth} ${endYear}`
  }

  // Different years
  return `${startDay} ${startMonth} ${startYear} to ${endDay} ${endMonth} ${endYear}`
}

