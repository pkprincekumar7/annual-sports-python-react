/**
 * useAuth Hook
 * Custom hook for authentication logic
 */

import { useState, useEffect, useCallback } from 'react'
import { fetchCurrentUser, decodeJWT } from '../utils/api'
import logger from '../utils/logger'

/**
 * Custom hook for managing authentication state
 */
export const useAuth = () => {
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('authToken') || null
  })
  const [loggedInUser, setLoggedInUser] = useState(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Fetch user data from server on mount if token exists
  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    const fetchUserData = async () => {
      const token = localStorage.getItem('authToken')
      if (!token) {
        if (isMounted) {
          setIsLoadingUser(false)
          setAuthToken(null)
          setLoggedInUser(null)
          setIsAuthenticated(false)
        }
        return
      }

      // Ensure authToken state is set from localStorage
      if (isMounted) {
        setAuthToken(token)
      }

      const tokenBeforeFetch = token

      try {
        const result = await fetchCurrentUser()

        if (!isMounted) return

        const tokenAfterFetch = localStorage.getItem('authToken')
        const tokenWasCleared = tokenBeforeFetch && !tokenAfterFetch

        if (result.user) {
          setLoggedInUser(result.user)
          setAuthToken(tokenBeforeFetch)
          setIsAuthenticated(true)
          setIsLoadingUser(false)
          if (tokenBeforeFetch && !tokenAfterFetch) {
            localStorage.setItem('authToken', tokenBeforeFetch)
          }
        } else if (result.authError || tokenWasCleared) {
          logger.info('Authentication error detected, clearing token')
          if (localStorage.getItem('authToken')) {
            localStorage.removeItem('authToken')
          }
          setAuthToken(null)
          setLoggedInUser(null)
          setIsAuthenticated(false)
          setIsLoadingUser(false)
        } else {
          logger.warn('Temporary error fetching user data. Result:', result)
          setAuthToken(tokenBeforeFetch)
          const retryFetch = async () => {
            if (!isMounted) return
            try {
              const retryResult = await fetchCurrentUser()
              if (!isMounted) return

              if (retryResult.user) {
                setLoggedInUser(retryResult.user)
                setAuthToken(localStorage.getItem('authToken'))
                setIsAuthenticated(true)
                setIsLoadingUser(false)
              } else if (retryResult.authError) {
                logger.info('Authentication error on retry, clearing token')
                localStorage.removeItem('authToken')
                setAuthToken(null)
                setLoggedInUser(null)
                setIsAuthenticated(false)
                setIsLoadingUser(false)
              } else {
                setIsLoadingUser(false)
              }
            } catch (retryError) {
              if (!isMounted) return
              logger.error('Error on retry fetch:', retryError)
              setIsLoadingUser(false)
            }
          }
          setTimeout(retryFetch, 0)
        }
      } catch (error) {
        if (!isMounted) return
        logger.error('Error fetching user data:', error)
        const currentToken = localStorage.getItem('authToken')
        if (!currentToken && tokenBeforeFetch) {
          setAuthToken(null)
          setLoggedInUser(null)
          setIsAuthenticated(false)
          setIsLoadingUser(false)
        } else {
          const retryFetch = async () => {
            if (!isMounted) return
            try {
              const retryResult = await fetchCurrentUser()
              if (!isMounted) return

              if (retryResult.user) {
                setLoggedInUser(retryResult.user)
                setAuthToken(localStorage.getItem('authToken'))
                setIsAuthenticated(true)
                setIsLoadingUser(false)
              } else if (retryResult.authError) {
                localStorage.removeItem('authToken')
                setAuthToken(null)
                setLoggedInUser(null)
                setIsAuthenticated(false)
                setIsLoadingUser(false)
              } else {
                setIsLoadingUser(false)
              }
            } catch (retryError) {
              if (!isMounted) return
              logger.error('Error on retry fetch:', retryError)
              setIsLoadingUser(false)
            }
          }
          setTimeout(retryFetch, 0)
        }
      }
    }

    fetchUserData()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [])

  // Login function
  const login = useCallback((player, token) => {
    setLoggedInUser(player)
    if (token) {
      setAuthToken(token)
      localStorage.setItem('authToken', token)
      setIsAuthenticated(true)
    }
  }, [])

  // Logout function
  const logout = useCallback(() => {
    setLoggedInUser(null)
    setAuthToken(null)
    setIsAuthenticated(false)
    localStorage.removeItem('authToken')
  }, [])

  // Update user data
  const updateUser = useCallback((updatedPlayer) => {
    setLoggedInUser(updatedPlayer)
  }, [])

  // Check if user is admin
  const isAdmin = useCallback(() => {
    return loggedInUser?.reg_number === 'admin'
  }, [loggedInUser])

  return {
    authToken,
    loggedInUser,
    isLoadingUser,
    isAuthenticated,
    login,
    logout,
    updateUser,
    isAdmin: isAdmin(),
  }
}

