import API_URL from '../config/api.js'
import logger from './logger.js'

// Cache configuration
// Note: /identities/me is never cached to ensure fresh authentication data
const CACHE_TTL = {
  '/identities/players': 5000, // 5 seconds for players list
  '/sports-participations/sports': 5000, // 5 seconds for sports list
  default: 5000, // 5 seconds default
}

// Request cache and deduplication
const requestCache = new Map()
const pendingRequests = new Map()

// Singleton lock for fetchCurrentUser to prevent race conditions on rapid refreshes
// All concurrent calls will share the same promise
let currentUserRequest = null

// Utility function to decode JWT token (without verification - for client-side use only)
export const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (error) {
    logger.error('Error decoding JWT:', error)
    return null
  }
}

// Helper function to build full API URL
export const buildApiUrl = (endpoint) => {
  // If endpoint already starts with http, use it as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint
  }
  // Otherwise, prepend API_URL
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const normalizedApiUrl = API_URL.endsWith('/')
    ? API_URL.slice(0, -1)
    : API_URL
  return `${normalizedApiUrl}${normalizedEndpoint}`
}

// Get cache key from URL and options
const getCacheKey = (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  // Only cache GET requests
  if (method !== 'GET') return null
  
  // Never cache /identities/me - authentication endpoints should always fetch fresh data
  // This prevents race conditions and stale authentication state on rapid page refreshes
  if (url === '/identities/me' || url.startsWith('/identities/me?')) {
    return null // Return null to disable caching for this endpoint
  }
  
  // Create cache key from URL
  return url
}

// Check if cached data is still valid
const isCacheValid = (cacheEntry, url) => {
  if (!cacheEntry) return false
  
  const ttl = CACHE_TTL[url] || CACHE_TTL.default
  const now = Date.now()
  return (now - cacheEntry.timestamp) < ttl
}

// Clear cache for a specific endpoint or all cache
export const clearCache = (url = null) => {
  if (url) {
    const cacheKey = getCacheKey(url)
    if (cacheKey) {
      requestCache.delete(cacheKey)
    }
  } else {
    requestCache.clear()
  }
}

// Clear cache for all URLs matching a pattern
export const clearCachePattern = (pattern) => {
  if (!pattern) {
    requestCache.clear()
    return
  }
  
  // Remove leading slash if present for pattern matching
  const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`
  
  // Find all cache keys that start with the pattern
  const keysToDelete = []
  for (const key of requestCache.keys()) {
    if (key.startsWith(normalizedPattern)) {
      keysToDelete.push(key)
    }
  }
  
  // Delete all matching keys
  keysToDelete.forEach(key => requestCache.delete(key))
}

// Utility function for authenticated API calls with caching and deduplication
export const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('authToken')
  
  // Build full URL using API_URL config
  const fullUrl = buildApiUrl(url)
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Check cache for GET requests (skip if skipCache option is set)
  const cacheKey = getCacheKey(url, options)
  if (cacheKey && !options.skipCache) {
    const cached = requestCache.get(cacheKey)
    if (isCacheValid(cached, url)) {
      // Return cached response as a new Response-like object
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    // Check for pending request (deduplication)
    // Skip deduplication for /identities/me to avoid race conditions on rapid refreshes
    if (pendingRequests.has(cacheKey) && !(url === '/identities/me' || url.startsWith('/identities/me?'))) {
      // Wait for the pending request to complete
      // Wrap it to clone the response for this specific caller
      // This ensures each caller gets their own independent clone
      return pendingRequests.get(cacheKey).then(response => response.clone())
    }
  }

  // Use provided signal or create a new AbortController
  const abortController = options.signal ? null : new AbortController()
  const signal = options.signal || abortController.signal

  // Make the request
  const requestPromise = fetch(fullUrl, {
    ...options,
    headers,
    signal,
  }).then(async (response) => {
    // Handle token expiration (401 Unauthorized) - user is not authenticated
    if (response.status === 401) {
      // Only clear token if explicitly requested (default true for backward compatibility)
      // During initial user fetch (reloadOnAuthError: false), don't clear token immediately
      // Let the calling code handle auth errors appropriately
      if (options.clearTokenOnAuthError !== false) {
      // Clear token only (user data is not stored in localStorage)
      localStorage.removeItem('authToken')
      // Clear cache on auth failure
      clearCache()
      }
      
      // Only reload if explicitly requested (not during initial user fetch)
      // The calling code should handle the auth error appropriately
      if (options.reloadOnAuthError !== false && !window.location.pathname.includes('login')) {
        // Use setTimeout to allow the calling code to handle the error first
        setTimeout(() => {
          window.location.reload()
        }, 100)
      }
      // Return original - will be cloned for each caller
      return response
    }
    
    // Handle 403 Forbidden - user is authenticated but lacks permission
    // This is different from 401 - user is still logged in, just doesn't have admin access
    // Don't clear token or reload page for 403 errors
    // The calling code should handle 403 appropriately (e.g., show empty data or hide admin features)
    if (response.status === 403) {
      // Don't clear token or reload - user is still authenticated
      // Just return the response so calling code can handle it
      return response
    }

    // Cache successful GET responses (only if skipCache is not set)
    if (cacheKey && response.ok && response.status === 200 && !options.skipCache) {
      try {
        // Clone response to read body without consuming the original
        const clonedForCache = response.clone()
        const data = await clonedForCache.json()
        
        requestCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        })
      } catch (e) {
        // If response is not JSON, don't cache
        logger.warn('Response is not JSON, skipping cache:', url)
      }
    }

    // Remove from pending requests
    if (cacheKey) {
      pendingRequests.delete(cacheKey)
    }

    // Return original response - will be cloned for each caller in the outer .then()
    return response
  }).then((response) => {
    // Clone the response here to ensure each caller gets their own copy
    // This is critical for deduplication - multiple callers waiting for the same request
    // will each get an independent clone they can read
    return response.clone()
  }).catch((error) => {
    // Remove from pending requests on error
    if (cacheKey) {
      pendingRequests.delete(cacheKey)
    }
    
    // Re-throw error
    throw error
  })

  // Store pending request for deduplication
  if (cacheKey) {
    pendingRequests.set(cacheKey, requestPromise)
  }

  return requestPromise
}

// Fetch current user data only (optimized - uses dedicated /identities/me endpoint)
// Returns { user: userData, authError: boolean } to distinguish auth failures from other errors
// Uses singleton pattern to prevent race conditions on rapid page refreshes
// Optional parameter: eventId for event filtering
export const fetchCurrentUser = async (eventId = null) => {
  const token = localStorage.getItem('authToken')
  if (!token) {
    // If there's a pending request, wait for it to complete
    if (currentUserRequest) {
      try {
        const result = await currentUserRequest
        // If the pending request cleared the token, return auth error
        if (!localStorage.getItem('authToken')) {
          return { user: null, authError: true }
        }
        return result
      } catch (error) {
        return { user: null, authError: false }
      }
    }
    return { user: null, authError: false }
  }

  // If there's already a pending request, reuse it to prevent duplicate requests
  // This prevents race conditions when multiple components call fetchCurrentUser simultaneously
  if (currentUserRequest) {
    try {
      const result = await currentUserRequest
      return result
    } catch (error) {
      return { user: null, authError: false }
    }
  }

  // Create new request and store it as singleton
  // All concurrent calls will share this same promise
  currentUserRequest = (async () => {
  try {
    const decoded = decodeJWT(token)
    if (!decoded || !decoded.reg_number) {
      // Invalid token format - this is an auth error
        currentUserRequest = null
      return { user: null, authError: true }
    }

      // Fetch current user directly using dedicated endpoint
      // /identities/me is never cached (see getCacheKey) to ensure fresh authentication data
      // Don't reload or clear token on auth error during initial fetch - let App.jsx handle it
      // This prevents false logouts on page refresh due to temporary network issues
      // Build URL with event_id if provided
      let meUrl = '/identities/me'
      if (eventId) {
        meUrl += `?event_id=${encodeURIComponent(String(eventId).trim())}`
      }
      let response = await fetchWithAuth(meUrl, { 
        reloadOnAuthError: false,
        clearTokenOnAuthError: false
      })
    
    // Check for authentication errors
    if (response.status === 401 || response.status === 403) {
        // Check if token still exists (might have been cleared by another request)
        const currentToken = localStorage.getItem('authToken')
        if (!currentToken || currentToken !== token) {
          // Token was cleared or changed by another request - don't retry, just return auth error
          currentUserRequest = null
          return { user: null, authError: true }
        }

        // For rapid refreshes, be more lenient - retry multiple times with increasing delays
        // This prevents false logouts due to temporary server issues or timing problems
        let retryCount = 0
        const maxRetries = 3
        const retryDelays = [50, 100, 200] // Increasing delays
        
        while (retryCount < maxRetries) {
          try {
            await new Promise(resolve => setTimeout(resolve, retryDelays[retryCount]))
            
            // Check token again before retry
            const tokenBeforeRetry = localStorage.getItem('authToken')
            if (!tokenBeforeRetry || tokenBeforeRetry !== token) {
              // Token was cleared or changed - stop retrying
              currentUserRequest = null
      return { user: null, authError: true }
            }

            response = await fetchWithAuth(meUrl, { 
              reloadOnAuthError: false,
              clearTokenOnAuthError: false
            })
            
            // If retry succeeded, break out of retry loop
            if (response.ok || (response.status !== 401 && response.status !== 403)) {
              break
            }
            
            retryCount++
          } catch (retryError) {
            // Network error on retry - treat as temporary error, not auth error
            logger.warn(`Retry ${retryCount + 1} failed in fetchCurrentUser:`, retryError)
            retryCount++
            // Continue to next retry
          }
        }
        
        // If all retries failed with 401/403, then it's a real auth error
        if (response.status === 401 || response.status === 403) {
          // DON'T clear the token here - let the calling code decide
          // On rapid refresh, we might get false positives, so be conservative
          // Only return authError, but don't clear the token
          // The calling code (App.jsx) will handle token clearing more carefully
          currentUserRequest = null
          return { user: null, authError: true }
        }
        // Retry succeeded - continue processing the response below
    }
    
    if (response.ok) {
      try {
        const data = await response.json()
        if (data.success && data.player) {
          // Backend returns 'player' for /identities/me endpoint
          const { password: _, ...userData } = data.player
            currentUserRequest = null
          return { user: userData, authError: false }
        } else {
          logger.warn('Unexpected response structure from /identities/me:', data)
            currentUserRequest = null
          return { user: null, authError: false }
        }
      } catch (jsonError) {
        // If response body was already read, try to get error details from response
        logger.error('Error parsing response JSON in fetchCurrentUser:', jsonError)
          currentUserRequest = null
        return { user: null, authError: false }
      }
    }
    
    // Other errors (network, server errors, etc.) - not auth errors
    logger.warn('API call failed with status:', response.status, 'for /identities/me')
      currentUserRequest = null
    return { user: null, authError: false }
  } catch (error) {
    // Network errors or other exceptions - not auth errors
    logger.error('Error fetching current user:', error)
      currentUserRequest = null
      return { user: null, authError: false }
    }
  })()

  try {
    const result = await currentUserRequest
    return result
  } catch (error) {
    return { user: null, authError: false }
  }
}

// Export API_URL for direct use in components if needed
export { API_URL }

