/**
 * useApi Hook
 * Reusable hook for API calls with loading, error, and data states
 */

import { useState, useCallback, useRef } from 'react'
import { fetchWithAuth, clearCache } from '../utils/api'
import logger from '../utils/logger'

/**
 * Custom hook for API calls
 * Handles loading, error, and data states
 */
export const useApi = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortControllerRef = useRef(null)

  const execute = useCallback(async (apiCall, options = {}) => {
    const {
      showError = true,
      onSuccess,
      onError,
      clearCacheOnSuccess = false,
      cacheKeys = [],
    } = options

    // Abort previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setLoading(true)
    setError(null)

    try {
      const response = await apiCall(abortController.signal)

      if (abortController.signal.aborted) {
        return null
      }

      if (!response.ok) {
        let errorMessage = 'An error occurred'
        try {
          const clonedResponse = response.clone()
          const errorData = await clonedResponse.json()
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }

        const error = new Error(errorMessage)
        error.status = response.status
        throw error
      }

      const data = await response.json()

      if (!data.success) {
        const error = new Error(data.error || 'Request failed')
        throw error
      }

      // Clear cache if specified
      if (clearCacheOnSuccess && cacheKeys.length > 0) {
        cacheKeys.forEach(key => clearCache(key))
      }

      if (onSuccess) {
        onSuccess(data)
      }

      return data
    } catch (err) {
      if (err.name === 'AbortError') {
        return null
      }

      logger.error('API call error:', err)
      setError(err.message || 'An error occurred')

      // Call onError if provided, regardless of showError flag
      // showError flag controls default error handling, but onError allows custom handling
      if (onError) {
        onError(err)
      }

      throw err
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setLoading(false)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  return {
    loading,
    error,
    execute,
    reset,
  }
}

/**
 * Hook for fetching data with automatic state management
 */
export const useFetch = (url, options = {}) => {
  const [data, setData] = useState(null)
  const { loading, error, execute, reset } = useApi()

  const fetch = useCallback(async () => {
    try {
      const result = await execute(
        (signal) => fetchWithAuth(url, { ...options, signal }),
        {
          ...options,
          onSuccess: (responseData) => {
            setData(responseData)
            if (options.onSuccess) {
              options.onSuccess(responseData)
            }
          },
        }
      )
      return result
    } catch (err) {
      // Error already handled by useApi
      return null
    }
  }, [url, execute, options])

  return {
    data,
    loading,
    error,
    fetch,
    reset: () => {
      reset()
      setData(null)
    },
  }
}

