/**
 * Year Helper Functions (Frontend)
 * Calendar boundaries use IST (Asia/Kolkata) for event-year dates.
 */

import {
  boundsForStoredDate,
  compareIstDays,
  currentIstYear,
  formatDateIst,
  nowIstMidnight,
  startOfIstDay,
  endOfIstDay,
} from './istDates'

/**
 * Generate year options for registration dropdown
 */
export function generateYearOfAdmissionOptions(currentYear = null) {
  const options = []
  const currentYearValue = currentYear || currentIstYear()
  const yearLabels = {
    1: '1st Year',
    2: '2nd Year',
    3: '3rd Year',
    4: '4th Year'
  }
  const years = [2025, 2024, 2023, 2022]

  years.forEach((yearOfAdmission) => {
    const yearDifference = currentYearValue - yearOfAdmission
    const label = yearLabels[yearDifference] || `${yearDifference}th Year`
    const formattedYear = `${label} (${yearOfAdmission})`
    options.push({ value: formattedYear, label: formattedYear })
  })

  return options
}

export function validateDateRelationships(registration_dates, event_dates) {
  if (!registration_dates || !event_dates) {
    return { isValid: false, error: 'Registration dates and event dates are required' }
  }

  if (!registration_dates.start || !registration_dates.end || !event_dates.start || !event_dates.end) {
    return { isValid: false, error: 'All date fields are required' }
  }

  const regStart = new Date(startOfIstDay(registration_dates.start))
  const regEnd = new Date(endOfIstDay(registration_dates.end))
  const eventStart = new Date(startOfIstDay(event_dates.start))
  const eventEnd = new Date(endOfIstDay(event_dates.end))

  if (regStart >= regEnd) {
    return { isValid: false, error: 'Registration start date must be before registration end date' }
  }

  if (compareIstDays(registration_dates.end, event_dates.start) >= 0) {
    return { isValid: false, error: 'Registration end date must be before event start date' }
  }

  if (eventStart >= eventEnd) {
    return { isValid: false, error: 'Event start date must be before event end date' }
  }

  return { isValid: true, error: null }
}

export function getUpdatableDateFields(existingEventYear) {
  const now = nowIstMidnight()
  const regStart = boundsForStoredDate(existingEventYear.registration_dates.start, false)
  const regEnd = boundsForStoredDate(existingEventYear.registration_dates.end, true)
  const eventStart = boundsForStoredDate(existingEventYear.event_dates.start, false)
  const eventEnd = boundsForStoredDate(existingEventYear.event_dates.end, true)

  const eventHasEnded = now > eventEnd

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

export function isWithinRegistrationPeriod(registration_dates) {
  if (!registration_dates?.start || !registration_dates?.end) {
    return false
  }
  const now = nowIstMidnight()
  const regStart = boundsForStoredDate(registration_dates.start, false)
  const regEnd = boundsForStoredDate(registration_dates.end, true)
  return now >= regStart && now <= regEnd
}

export function isEventEnded(eventYearConfig) {
  if (!eventYearConfig?.event_dates?.end) {
    return false
  }
  const now = nowIstMidnight()
  const eventEnd = boundsForStoredDate(eventYearConfig.event_dates.end, true)
  return now > eventEnd
}

export function isRegistrationPeriodEnded(eventYearConfig) {
  if (!eventYearConfig?.registration_dates?.end) {
    return true
  }
  const now = nowIstMidnight()
  const regEnd = boundsForStoredDate(eventYearConfig.registration_dates.end, true)
  return now > regEnd
}

export function isRegistrationPeriodStarted(eventYearConfig) {
  if (!eventYearConfig?.registration_dates?.start) {
    return false
  }
  const now = nowIstMidnight()
  const regStart = boundsForStoredDate(eventYearConfig.registration_dates.start, false)
  return now >= regStart
}

export function isWithinEventPeriod(eventYearConfig) {
  if (!eventYearConfig?.registration_dates || !eventYearConfig?.event_dates) {
    return false
  }
  const now = nowIstMidnight()
  const regEnd = boundsForStoredDate(eventYearConfig.registration_dates.end, true)
  const eventEnd = boundsForStoredDate(eventYearConfig.event_dates.end, true)
  return now > regEnd && now <= eventEnd
}

export function isWithinEventStatusUpdatePeriod(eventYearConfig) {
  if (!eventYearConfig?.event_dates?.start || !eventYearConfig?.event_dates?.end) {
    return false
  }
  const now = nowIstMidnight()
  const eventStart = boundsForStoredDate(eventYearConfig.event_dates.start, false)
  const eventEnd = boundsForStoredDate(eventYearConfig.event_dates.end, true)
  return now >= eventStart && now <= eventEnd
}

/**
 * Event setup data (sports, batches) can be managed any time until registration
 * ends, including before registration starts, so admins can set things up in advance.
 */
export function shouldDisableEventSetup(eventYearConfig, subject = 'Sports') {
  if (!eventYearConfig) {
    return {
      disabled: true,
      reason: 'Event year is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  if (!eventYearConfig.registration_dates?.end) {
    return {
      disabled: true,
      reason: 'Registration deadline is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  if (isRegistrationPeriodEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: `${subject} can only be managed until registration ends (${formatDateForDisplay(eventYearConfig.registration_dates.end)}).`
    }
  }

  return { disabled: false, reason: '' }
}

export function shouldDisableDatabaseOperations(eventYearConfig) {
  if (!eventYearConfig) {
    return {
      disabled: true,
      reason: 'Event year is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  if (!eventYearConfig.registration_dates?.end) {
    return {
      disabled: true,
      reason: 'Registration deadline is not configured. Please contact administrator to set up event year with registration dates.'
    }
  }

  if (!isRegistrationPeriodStarted(eventYearConfig)) {
    return {
      disabled: true,
      reason: `Registration has not started yet. It begins on ${formatDateForDisplay(eventYearConfig.registration_dates.start)}.`
    }
  }

  if (isEventEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: 'Event has ended. All operations are now view-only.'
    }
  }

  if (isRegistrationPeriodEnded(eventYearConfig)) {
    return {
      disabled: true,
      reason: `Registration for events closed on ${formatDateForDisplay(eventYearConfig.registration_dates.end)}.`
    }
  }

  return { disabled: false, reason: '' }
}

export function getEventPeriodStatus(eventYearConfig) {
  if (!eventYearConfig?.registration_dates || !eventYearConfig?.event_dates) {
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

  const now = nowIstMidnight()
  const regEnd = boundsForStoredDate(eventYearConfig.registration_dates.end, true)

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

export function getEventStatusUpdatePeriodStatus(eventYearConfig) {
  if (!eventYearConfig?.event_dates?.start || !eventYearConfig?.event_dates?.end) {
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

function formatDateForDisplay(date) {
  return formatDateIst(date)
}

export function canDeleteEventYear(eventYear) {
  if (!eventYear?.registration_dates?.start) {
    return {
      canDelete: false,
      reason: 'Event year configuration is incomplete. Cannot determine if deletion is allowed.'
    }
  }

  const now = nowIstMidnight()
  const regStart = boundsForStoredDate(eventYear.registration_dates.start, false)

  if (now >= regStart) {
    return {
      canDelete: false,
      reason: `Cannot delete event year. Deletion is only allowed before registration start date (${formatDateForDisplay(eventYear.registration_dates.start)}).`
    }
  }

  return { canDelete: true, reason: '' }
}
