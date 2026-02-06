/**
 * Year Helper Functions (Frontend)
 * Utility functions for year-related operations in the frontend
 */

/**
 * Generate year options for registration dropdown
 * Returns formatted year strings for exactly 4 years: 2022, 2023, 2024, 2025
 * @param {number|null} currentYear - Current year (not used, kept for compatibility)
 * @returns {Array} Array of year options with value and label as formatted strings
 */
export function generateYearOfAdmissionOptions(currentYear = null) {
  const options = []
  
  // Fixed set of 4 years: 2022, 2023, 2024, 2025
  // Calculate year labels based on current year
  const currentYearValue = currentYear || new Date().getFullYear()
  const yearLabels = {
    1: '1st Year',
    2: '2nd Year',
    3: '3rd Year',
    4: '4th Year'
  }
  
  // Generate options for years 2022, 2023, 2024, 2025
  const years = [2025, 2024, 2023, 2022]
  
  years.forEach((yearOfAdmission, index) => {
    const yearDifference = currentYearValue - yearOfAdmission
    const label = yearLabels[yearDifference] || `${yearDifference}th Year`
    const formattedYear = `${label} (${yearOfAdmission})`
    
    options.push({
      value: formattedYear,
      label: formattedYear
    })
  })

  return options
}

/**
 * Validate date relationships for event year (frontend)
 * Must satisfy: registration_dates.start < registration_dates.end < event_dates.start < event_dates.end
 * @param {Object} registration_dates - Registration dates object with start and end (YYYY-MM-DD format)
 * @param {Object} event_dates - Event dates object with start and end (YYYY-MM-DD format)
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export function validateDateRelationships(registration_dates, event_dates) {
  if (!registration_dates || !event_dates) {
    return { isValid: false, error: 'Registration dates and event dates are required' }
  }

  if (!registration_dates.start || !registration_dates.end || !event_dates.start || !event_dates.end) {
    return { isValid: false, error: 'All date fields are required' }
  }

  const regStart = new Date(registration_dates.start + 'T00:00:00')
  regStart.setHours(0, 0, 0, 0)

  const regEnd = new Date(registration_dates.end + 'T23:59:59')
  regEnd.setHours(23, 59, 59, 999)

  const eventStart = new Date(event_dates.start + 'T00:00:00')
  eventStart.setHours(0, 0, 0, 0)

  const eventEnd = new Date(event_dates.end + 'T23:59:59')
  eventEnd.setHours(23, 59, 59, 999)

  if (regStart >= regEnd) {
    return { isValid: false, error: 'Registration start date must be before registration end date' }
  }

  if (regEnd >= eventStart) {
    return { isValid: false, error: 'Registration end date must be before event start date' }
  }

  if (eventStart >= eventEnd) {
    return { isValid: false, error: 'Event start date must be before event end date' }
  }

  return { isValid: true, error: null }
}

/**
 * Determine which date fields can be updated based on current date and existing event year dates (frontend)
 * @param {Object} existingEventYear - Existing event year object with dates
 * @returns {Object} Object indicating which dates can be updated and tooltip messages
 */
export function getUpdatableDateFields(existingEventYear) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const regStart = new Date(existingEventYear.registration_dates.start)
  regStart.setHours(0, 0, 0, 0)

  const regEnd = new Date(existingEventYear.registration_dates.end)
  regEnd.setHours(23, 59, 59, 999)

  const eventStart = new Date(existingEventYear.event_dates.start)
  eventStart.setHours(0, 0, 0, 0)

  const eventEnd = new Date(existingEventYear.event_dates.end)
  eventEnd.setHours(23, 59, 59, 999)

  // Check if event has ended
  const eventHasEnded = now > eventEnd

  // After event ends: nothing can be updated
  if (eventHasEnded) {
    return {
      canUpdateRegStart: false,
      canUpdateRegEnd: false,
      canUpdateEventStart: false,
      canUpdateEventEnd: false,
      canUpdateNonDateFields: false,
      regStartTooltip: 'Registration has already started',
      regEndTooltip: 'Registration has already ended',
      eventStartTooltip: 'Event has already started',
      eventEndTooltip: 'Event has already ended',
      nonDateFieldsTooltip: 'Event has already ended. Configuration cannot be updated.'
    }
  }

  // After event starts: only event end can be updated
  if (now >= eventStart) {
    return {
      canUpdateRegStart: false,
      canUpdateRegEnd: false,
      canUpdateEventStart: false,
      canUpdateEventEnd: true,
      canUpdateNonDateFields: true,
      regStartTooltip: 'Registration has already started',
      regEndTooltip: 'Registration has already ended',
      eventStartTooltip: 'Event has already started',
      eventEndTooltip: '',
      nonDateFieldsTooltip: ''
    }
  }

  // After registration ends: only event dates can be updated
  if (now >= regEnd) {
    return {
      canUpdateRegStart: false,
      canUpdateRegEnd: false,
      canUpdateEventStart: true,
      canUpdateEventEnd: true,
      canUpdateNonDateFields: true,
      regStartTooltip: 'Registration has already started',
      regEndTooltip: 'Registration has already ended',
      eventStartTooltip: '',
      eventEndTooltip: '',
      nonDateFieldsTooltip: ''
    }
  }

  // After registration starts: reg end and event dates can be updated
  if (now >= regStart) {
    return {
      canUpdateRegStart: false,
      canUpdateRegEnd: true,
      canUpdateEventStart: true,
      canUpdateEventEnd: true,
      canUpdateNonDateFields: true,
      regStartTooltip: 'Registration has already started',
      regEndTooltip: '',
      eventStartTooltip: '',
      eventEndTooltip: '',
      nonDateFieldsTooltip: ''
    }
  }

  // Before registration starts: all dates can be updated
  return {
    canUpdateRegStart: true,
    canUpdateRegEnd: true,
    canUpdateEventStart: true,
    canUpdateEventEnd: true,
    canUpdateNonDateFields: true,
    regStartTooltip: '',
    regEndTooltip: '',
    eventStartTooltip: '',
    eventEndTooltip: '',
    nonDateFieldsTooltip: ''
  }
}

/**
 * Check if current date is within registration period (frontend)
 * @param {Object} registration_dates - Registration dates object with start and end (Date objects or ISO strings)
 * @returns {boolean} True if current date is within registration period
 */
export function isWithinRegistrationPeriod(registration_dates) {
  if (!registration_dates || !registration_dates.start || !registration_dates.end) {
    return false
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const regStart = new Date(registration_dates.start)
  regStart.setHours(0, 0, 0, 0)

  const regEnd = new Date(registration_dates.end)
  regEnd.setHours(23, 59, 59, 999)

  return now >= regStart && now <= regEnd
}

/**
 * Check if event has ended (frontend)
 * @param {Object} eventYearConfig - Event year configuration object with event_dates
 * @returns {boolean} True if event has ended
 */
export function isEventEnded(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.event_dates || !eventYearConfig.event_dates.end) {
    return false // If no event config, assume event hasn't ended (to avoid blocking operations)
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const eventEnd = new Date(eventYearConfig.event_dates.end)
  eventEnd.setHours(23, 59, 59, 999)

  return now > eventEnd
}

/**
 * Check if registration period has ended (frontend)
 * @param {Object} eventYearConfig - Event year configuration object with registration_dates
 * @returns {boolean} True if registration period has ended
 */
export function isRegistrationPeriodEnded(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.registration_dates || !eventYearConfig.registration_dates.end) {
    return true // If no registration dates configured, consider it ended (to block operations)
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const regEnd = new Date(eventYearConfig.registration_dates.end)
  regEnd.setHours(23, 59, 59, 999)

  return now > regEnd
}

/**
 * Check if registration period has started (frontend)
 * @param {Object} eventYearConfig - Event year configuration object with registration_dates
 * @returns {boolean} True if registration period has started
 */
export function isRegistrationPeriodStarted(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.registration_dates || !eventYearConfig.registration_dates.start) {
    return false
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const regStart = new Date(eventYearConfig.registration_dates.start)
  regStart.setHours(0, 0, 0, 0)

  return now >= regStart
}

/**
 * Check if current date is within event period (after registration end, before event end)
 * @param {Object} eventYearConfig - Event year configuration object with registration_dates and event_dates
 * @returns {boolean} True if within event period
 */
export function isWithinEventPeriod(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.registration_dates || !eventYearConfig.event_dates) {
    return false
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const regEnd = new Date(eventYearConfig.registration_dates.end)
  regEnd.setHours(23, 59, 59, 999)

  const eventEnd = new Date(eventYearConfig.event_dates.end)
  eventEnd.setHours(23, 59, 59, 999)

  return now > regEnd && now <= eventEnd
}

/**
 * Check if current date is within event status update period (event start to event end)
 * @param {Object} eventYearConfig - Event year configuration object with event_dates
 * @returns {boolean} True if within event status update period
 */
export function isWithinEventStatusUpdatePeriod(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.event_dates || !eventYearConfig.event_dates.start || !eventYearConfig.event_dates.end) {
    return false
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const eventStart = new Date(eventYearConfig.event_dates.start)
  eventStart.setHours(0, 0, 0, 0)

  const eventEnd = new Date(eventYearConfig.event_dates.end)
  eventEnd.setHours(23, 59, 59, 999)

  return now >= eventStart && now <= eventEnd
}

/**
 * Check if database operations should be disabled (frontend)
 * Operations are disabled if:
 * 1. Event year configuration is not available
 * 2. Registration period has ended
 * 3. Event has ended
 * @param {Object} eventYearConfig - Event year configuration object
 * @returns {Object} { disabled: boolean, reason: string } - Whether operations should be disabled and why
 */
export function shouldDisableDatabaseOperations(eventYearConfig) {
  // Check if event year config is available
  if (!eventYearConfig) {
    return {
      disabled: true,
      reason: 'Event year is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  // Check if registration dates are configured
  if (!eventYearConfig.registration_dates || !eventYearConfig.registration_dates.end) {
    return {
      disabled: true,
      reason: 'Registration deadline is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  // Check if registration period has not started yet
  if (!isRegistrationPeriodStarted(eventYearConfig)) {
    return {
      disabled: true,
      reason: `Registration has not started yet. It begins on ${formatDateForDisplay(eventYearConfig.registration_dates.start)}.`
    }
  }

  // Check if event has ended
  if (isEventEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: 'Event has ended. All operations are now view-only.'
    }
  }

  // Check if registration period has ended
  if (isRegistrationPeriodEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: `Registration for events closed on ${formatDateForDisplay(eventYearConfig.registration_dates.end)}.`
    }
  }

  return {
    disabled: false,
    reason: ''
  }
}

/**
 * Check if event scheduling operations should be disabled (frontend)
 * Matches backend requireEventPeriod: after registration end, before event end
 * @param {Object} eventYearConfig - Event year configuration object
 * @returns {Object} { disabled: boolean, reason: string }
 */
export function getEventPeriodStatus(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.registration_dates || !eventYearConfig.event_dates) {
    return {
      disabled: true,
      reason: 'Event dates are not configured. Please contact administrator.'
    }
  }

  if (isEventEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: 'Event has ended. Match scheduling is closed.'
    }
  }

  const regEnd = new Date(eventYearConfig.registration_dates.end)
  regEnd.setHours(23, 59, 59, 999)
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (now <= regEnd) {
    return {
      disabled: true,
      reason: `Match scheduling opens after registration ends (${formatDateForDisplay(eventYearConfig.registration_dates.end)}).`
    }
  }

  if (!isWithinEventPeriod(eventYearConfig)) {
    return {
      disabled: true,
      reason: 'Match scheduling is only allowed during the event period.'
    }
  }

  return { disabled: false, reason: '' }
}

/**
 * Check if event status updates are allowed (frontend)
 * Matches backend requireEventStatusUpdatePeriod: event start to event end
 * @param {Object} eventYearConfig - Event year configuration object
 * @returns {Object} { disabled: boolean, reason: string }
 */
export function getEventStatusUpdatePeriodStatus(eventYearConfig) {
  if (!eventYearConfig || !eventYearConfig.event_dates || !eventYearConfig.event_dates.start || !eventYearConfig.event_dates.end) {
    return {
      disabled: true,
      reason: 'Event dates are not configured. Please contact administrator.'
    }
  }

  if (!isWithinEventStatusUpdatePeriod(eventYearConfig)) {
    return {
      disabled: true,
      reason: `Match status updates are only allowed during the event period (${formatDateForDisplay(eventYearConfig.event_dates.start)} to ${formatDateForDisplay(eventYearConfig.event_dates.end)}).`
    }
  }

  return { disabled: false, reason: '' }
}

/**
 * Format date for display (frontend)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string (e.g., "1st Jan 2026")
 */
function formatDateForDisplay(date) {
  const d = new Date(date)
  const day = d.getDate()
  const month = d.toLocaleString('en-US', { month: 'short' })
  const year = d.getFullYear()
  const ordinal = getOrdinal(day)
  return `${ordinal} ${month} ${year}`
}

/**
 * Get ordinal suffix for day
 * @param {number} day - Day number
 * @returns {string} Day with ordinal suffix
 */
function getOrdinal(day) {
  const j = day % 10
  const k = day % 100
  if (j === 1 && k !== 11) return day + 'st'
  if (j === 2 && k !== 12) return day + 'nd'
  if (j === 3 && k !== 13) return day + 'rd'
  return day + 'th'
}

/**
 * Check if event year deletion is allowed (frontend)
 * Deletion is only allowed before registration start date
 * @param {Object} eventYear - Event year object with registration_dates
 * @returns {Object} { canDelete: boolean, reason: string } - Whether deletion is allowed and why
 */
export function canDeleteEventYear(eventYear) {
  if (!eventYear || !eventYear.registration_dates || !eventYear.registration_dates.start) {
    return {
      canDelete: false,
      reason: 'Event year configuration is incomplete. Cannot determine if deletion is allowed.'
    }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  
  const regStart = new Date(eventYear.registration_dates.start)
  regStart.setHours(0, 0, 0, 0)

  if (now >= regStart) {
    const formattedDate = formatDateForDisplay(eventYear.registration_dates.start)
    return {
      canDelete: false,
      reason: `Cannot delete event year. Deletion is only allowed before registration start date (${formattedDate}).`
    }
  }

  return {
    canDelete: true,
    reason: ''
  }
}
