/**
 * Custom hook to fetch active event year
 * Fetches the currently active event year configuration
 * Supports refetching via custom event 'eventYearUpdated'
 * If no active event year is found and user is logged in, falls back to latest event year
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchWithAuth } from '../utils/api'
import logger from '../utils/logger'
import { useEventYears } from './useEventYears'
import { useSelectedEvent } from '../context/SelectedEventContext'

let hasWarnedNoActiveEvent = false

export function useEventYear(selectedEventIdOverride = null) {
  const [eventYear, setEventYear] = useState(null)
  const [eventYearConfig, setEventYearConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { selectedEventId: contextSelectedEventId } = useSelectedEvent()
  const { eventYears } = useEventYears()

  // Helper function to fetch latest event year from all event years list
  const fetchLatestEventYear = useCallback(async () => {
    try {
      const authToken = localStorage.getItem('authToken')
      if (!authToken) {
        // Not logged in, can't fetch event years list
        return null
      }

      const response = await fetchWithAuth('/event-configurations/event-years')
      
      if (!response.ok) {
        logger.warn('Failed to fetch event years for fallback:', response.status)
        return null
      }

      const data = await response.json()
      const eventYearsData = data.eventYears || (Array.isArray(data) ? data : [])
      
      if (Array.isArray(eventYearsData) && eventYearsData.length > 0) {
        // Event years are already sorted by event_year descending from backend
        // Return the first one (latest/most recent)
        const latestEventYear = eventYearsData[0]
        // Ensure event_name exists in the latest event year
        if (!latestEventYear.event_name) {
          logger.warn('Latest event year missing event_name:', latestEventYear)
        }
        logger.info('Using latest event year as fallback:', latestEventYear.event_year, 'event_name:', latestEventYear.event_name)
        return latestEventYear
      }
      
      return null
    } catch (err) {
      logger.warn('Error fetching latest event year for fallback:', err)
      return null
    }
  }, [])

  const fetchActiveYear = useCallback(async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetchWithAuth('/event-configurations/event-years/active')
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        if (data.success) {
          if (data.eventYear) {
            setEventYearConfig(data.eventYear)
            setEventYear(data.eventYear.event_year)
          } else {
            // No active event year found
            if (!hasWarnedNoActiveEvent) {
              logger.warn('No active event year found')
              hasWarnedNoActiveEvent = true
            }
            
            // Check if user is logged in - if yes, use latest event year as fallback
            const authToken = localStorage.getItem('authToken')
            if (authToken) {
              // User is logged in - fetch latest event year as fallback
              const latestEventYear = await fetchLatestEventYear()
              if (latestEventYear) {
                setEventYearConfig(latestEventYear)
                setEventYear(latestEventYear.event_year)
                logger.info('Using latest event year as fallback after login:', latestEventYear.event_year)
              } else {
                // Couldn't fetch latest event year - use current year as last resort
                const currentYear = new Date().getFullYear()
                setEventYear(currentYear)
                setEventYearConfig(null)
                setError(data.error || 'No active event year found and could not fetch latest event year')
              }
            } else {
              // Not logged in - use current year as fallback
              const currentYear = new Date().getFullYear()
              setEventYear(currentYear)
              setEventYearConfig(null)
              setError(data.error || 'No active event year found')
            }
          }
        } else {
          throw new Error(data.error || 'Failed to fetch active event year')
        }
      } catch (err) {
        logger.error('Error fetching active event year:', err)
        setError(err.message || 'Failed to fetch active event year')
        
        // On error, try to use latest event year if logged in
        const authToken = localStorage.getItem('authToken')
        if (authToken) {
          const latestEventYear = await fetchLatestEventYear()
          if (latestEventYear) {
            setEventYearConfig(latestEventYear)
            setEventYear(latestEventYear.event_year)
            logger.info('Using latest event year as fallback after error:', latestEventYear.event_year)
          } else {
            // Fallback to current year
            const currentYear = new Date().getFullYear()
            setEventYear(currentYear)
            setEventYearConfig(null)
          }
        } else {
          // Not logged in - fallback to current year
          const currentYear = new Date().getFullYear()
          setEventYear(currentYear)
          setEventYearConfig(null)
        }
      } finally {
        setLoading(false)
      }
  }, [fetchLatestEventYear])

  useEffect(() => {
    // Initial fetch
    fetchActiveYear()

    // Listen for event year updates to trigger refetch
    const handleEventYearUpdate = () => {
      fetchActiveYear()
    }

    // Listen for login events to refetch (in case no active event year, will use latest)
    const handleLogin = () => {
      // Small delay to ensure token is set in localStorage
      setTimeout(() => {
        fetchActiveYear()
      }, 100)
    }

    window.addEventListener('eventYearUpdated', handleEventYearUpdate)
    window.addEventListener('userLoggedIn', handleLogin)

    return () => {
      window.removeEventListener('eventYearUpdated', handleEventYearUpdate)
      window.removeEventListener('userLoggedIn', handleLogin)
    }
  }, [fetchActiveYear])

  const resolvedSelectedEventId = selectedEventIdOverride ?? contextSelectedEventId
  const normalizedSelectedEventId = resolvedSelectedEventId ? String(resolvedSelectedEventId) : null
  const selectedEventData = useMemo(() => {
    if (!normalizedSelectedEventId || eventYears.length === 0) {
      return null
    }
    return eventYears.find(ey => ey.event_id === normalizedSelectedEventId) || null
  }, [eventYears, normalizedSelectedEventId])

  const resolvedEventYearConfig = selectedEventData || eventYearConfig
  const resolvedEventYear = resolvedEventYearConfig?.event_year ?? eventYear

  return {
    eventYear: resolvedEventYear,
    eventYearConfig: resolvedEventYearConfig,
    loading,
    error,
    refetch: fetchActiveYear
  }
}

