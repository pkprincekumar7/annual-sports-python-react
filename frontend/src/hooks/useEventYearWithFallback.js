/**
 * Custom hook to get event year with fallback
 * Uses selectedEventId if provided, otherwise falls back to the active event
 * Always returns eventId for internal usage and eventYear/eventName for display
 * 
 * @param {string|null} selectedEventId - Optional selected event_id (typically from admin)
 * @returns {{ eventYear: number|null, eventName: string|null, eventId: string|null }} Object with eventYear, eventName, and eventId
 */
import { useEventYear } from './useEventYear'
import { useEventYears } from './useEventYears'
import logger from '../utils/logger'

export function useEventYearWithFallback(selectedEventId) {
  const { eventYear: activeEventYear, eventYearConfig } = useEventYear()
  const { eventYears, loading: eventYearsLoading } = useEventYears()
  const normalizedSelectedEventId = selectedEventId
    ? String(selectedEventId).trim().toLowerCase()
    : null

  let eventId = normalizedSelectedEventId || eventYearConfig?.event_id || null
  let eventYear = null
  let eventName = null

  // Resolve eventName/eventYear from event_id whenever possible
  if (eventId && eventYears.length > 0) {
    const eventYearData = eventYears.find(ey => ey.event_id === eventId)
    eventYear = eventYearData?.event_year ?? null
    eventName = eventYearData?.event_name ?? null
  }

  // Fall back to active event config if needed
  if ((!eventYear || !eventName) && eventYearConfig) {
    eventYear = eventYear ?? eventYearConfig.event_year ?? null
    eventName = eventName ?? eventYearConfig.event_name ?? null
  }

  // If event_id isn't set, fall back to active event year for display
  if (!eventId && activeEventYear && eventYears.length > 0) {
    const activeEventData = eventYears.find(ey => ey.event_year === activeEventYear)
    eventYear = eventYear ?? activeEventData?.event_year ?? activeEventYear
    eventName = eventName ?? activeEventData?.event_name ?? null
    eventId = eventId ?? activeEventData?.event_id ?? null
  }

  // Log warning if eventId is set but display fields are missing (for debugging)
  if (
    eventId &&
    (!eventName || !eventYear) &&
    !eventYearsLoading &&
    (eventYears.length > 0 || eventYearConfig)
  ) {
    logger.warn(
      `useEventYearWithFallback: eventId ${eventId} found but eventYear/eventName is missing. eventYearConfig:`,
      eventYearConfig,
      'eventYears:',
      eventYears.length
    )
  }

  return { eventYear, eventName, eventId }
}

