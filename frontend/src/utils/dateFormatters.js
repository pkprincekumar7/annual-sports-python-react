/**
 * Date Formatting Utilities (IST calendar for event dates)
 */

import { formatDateIst } from './istDates'

/**
 * Format a date range for display (e.g., "9th Jan 2026 to 13th Jan 2026")
 */
export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return ''

  const startLabel = formatDateIst(startDate)
  const endLabel = formatDateIst(endDate)

  if (startLabel === endLabel) {
    return startLabel
  }

  const startParts = startLabel.split(' ')
  const endParts = endLabel.split(' ')

  if (startParts.length >= 3 && endParts.length >= 3) {
    const startMonth = startParts[1]
    const startYear = startParts[2]
    const endMonth = endParts[1]
    const endYear = endParts[2]

    if (startMonth === endMonth && startYear === endYear) {
      return `${startParts[0]} ${startMonth} ${startYear} to ${endParts[0]} ${endMonth} ${endYear}`
    }

    if (startYear === endYear) {
      return `${startParts[0]} ${startMonth} to ${endParts[0]} ${endMonth} ${endYear}`
    }
  }

  return `${startLabel} to ${endLabel}`
}
