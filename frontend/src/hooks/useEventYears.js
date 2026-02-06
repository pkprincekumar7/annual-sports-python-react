/**
 * Custom hook to fetch and cache all event years
 * Returns list of all event years with their event_name for lookup
 * Caches the result to avoid multiple API calls
 */

import { useState, useEffect } from 'react'
import { fetchWithAuth } from '../utils/api'
import logger from '../utils/logger'

// Cache the event years list at module level to share across all hook instances
let cachedEventYears = null
let fetchPromise = null
let fetchFailed = false // Track if fetch failed due to auth (don't retry)

export function useEventYears() {
  const [eventYears, setEventYears] = useState(cachedEventYears || [])
  const [loading, setLoading] = useState(!cachedEventYears && !fetchFailed)
  const [refreshTrigger, setRefreshTrigger] = useState(0) // State to trigger re-fetch when cache is reset
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken'))

  // Listen for cache reset and login events
  useEffect(() => {
    const handleCacheReset = () => {
      setRefreshTrigger(prev => prev + 1)
    }
    const handleLogin = () => {
      setAuthToken(localStorage.getItem('authToken'))
    }
    const handleStorage = (event) => {
      if (event.key === 'authToken') {
        setAuthToken(event.newValue)
      }
    }
    window.addEventListener('eventYearsCacheReset', handleCacheReset)
    window.addEventListener('userLoggedIn', handleLogin)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('eventYearsCacheReset', handleCacheReset)
      window.removeEventListener('userLoggedIn', handleLogin)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    // Check if user is authenticated before attempting to fetch
    // This endpoint requires admin authentication, so don't fetch if no token
    if (!authToken) {
      // No token - don't attempt to fetch
      cachedEventYears = null
      fetchPromise = null
      fetchFailed = false
      setEventYears([])
      setLoading(false)
      return
    }

    // If already cached, use it immediately
    if (cachedEventYears) {
      setEventYears(cachedEventYears)
      setLoading(false)
      return
    }

    // If fetch previously failed due to auth, don't retry
    if (fetchFailed) {
      setLoading(false)
      return
    }

    // If a fetch is already in progress, wait for it
    if (fetchPromise) {
      fetchPromise.then((sortedEventYears) => {
        if (sortedEventYears) {
          setEventYears(sortedEventYears)
          setLoading(false)
        }
      }).catch(() => {
        setLoading(false)
      })
      return
    }

    // Fetch event years
    const fetchEventYears = async () => {
      setLoading(true)
      try {
        fetchPromise = (async () => {
          const response = await fetchWithAuth('/event-configurations/event-years')
          
          // Handle 401 (unauthorized) - user is not logged in
          if (response.status === 401) {
            fetchFailed = true // Don't retry on auth errors
            logger.warn('Unauthorized to fetch event years - user may not be logged in')
            return []
          }
          
          // Handle 403 (forbidden) - user is logged in but lacks permission
          // This should not happen for this endpoint (it's accessible to all authenticated users)
          // But keep this as a safety measure in case of other permission issues
          if (response.status === 403) {
            fetchFailed = true // Don't retry on permission errors
            logger.warn('Forbidden to fetch event years - unexpected permission error')
            return []
          }
          
          if (!response.ok) {
            throw new Error(`Failed to fetch event years: ${response.status}`)
          }
          
          const data = await response.json()
          // Backend returns { success: true, eventYears: [...] }
          const eventYearsData = data.eventYears || (Array.isArray(data) ? data : [])
          const sortedEventYears = Array.isArray(eventYearsData) 
            ? eventYearsData.sort((a, b) => b.event_year - a.event_year)
            : []
          
          // Cache the result
          cachedEventYears = sortedEventYears
          fetchFailed = false // Reset on success
          return sortedEventYears
        })()
        
        const sortedEventYears = await fetchPromise
        setEventYears(sortedEventYears)
        setLoading(false)
      } catch (error) {
        logger.error('Error fetching event years:', error)
        // Set fetchFailed for auth/permission errors (401, 403), not other errors
        if (error.message?.includes('401') || error.message?.includes('Unauthorized') ||
            error.message?.includes('403') || error.message?.includes('Forbidden')) {
          fetchFailed = true
        }
        setEventYears([])
        setLoading(false)
      } finally {
        fetchPromise = null
      }
    }

    fetchEventYears()
  }, [refreshTrigger, authToken]) // Re-run when refresh trigger changes or token updates

  return { eventYears, loading }
}

// Export function to reset cache (useful when user logs in)
// Dispatching event will cause all hook instances to re-fetch
export function resetEventYearsCache() {
  cachedEventYears = null
  fetchPromise = null
  fetchFailed = false // Reset fetchFailed so hook can attempt fetch after login
  // Dispatch event to notify all hook instances to re-fetch
  window.dispatchEvent(new Event('eventYearsCacheReset'))
}
