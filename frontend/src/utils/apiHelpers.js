/**
 * API URL building utilities
 * Centralizes URL construction with proper encoding and event_id parameters
 */

/**
 * Build API URL for sport-specific endpoints
 * @param {string} endpoint - The endpoint name (e.g., 'teams', 'participants')
 * @param {string} sportName - The sport name
 * @param {string|null} eventId - Optional event_id
 * @returns {string} - The complete API URL
 */
export const buildSportApiUrl = (endpoint, sportName, eventId = null) => {
  if (!sportName) return ''
  const encodedSport = encodeURIComponent(sportName)
  const params = []
  if (eventId) {
    params.push(`event_id=${encodeURIComponent(String(eventId).trim())}`)
  }
  const queryString = params.length > 0 ? `?${params.join('&')}` : ''
  return `/sports-participations/${endpoint}/${encodedSport}${queryString}`
}

/**
 * Build API URL for event schedule endpoints
 * @param {string} sportName - The sport name
 * @param {string} subPath - Optional sub-path (e.g., 'teams-players')
 * @param {string|null} eventId - Optional event_id
 * @param {string|null} gender - Optional gender ('Male' or 'Female')
 * @returns {string} - The complete API URL
 */
export const buildEventScheduleApiUrl = (sportName, subPath = '', eventId = null, gender = null) => {
  if (!sportName) return ''
  const encodedSport = encodeURIComponent(sportName)
  const path = subPath ? `${encodedSport}/${subPath}` : encodedSport
  const params = []
  if (eventId) {
    params.push(`event_id=${encodeURIComponent(String(eventId).trim())}`)
  }
  if (gender && (gender === 'Male' || gender === 'Female')) params.push(`gender=${encodeURIComponent(gender)}`)
  const queryString = params.length > 0 ? `?${params.join('&')}` : ''
  return `/schedulings/event-schedule/${path}${queryString}`
}

/**
 * Build API URL with event_id parameter
 * @param {string} baseUrl - The base URL (e.g., '/sports-participations/sports')
 * @param {string|null} eventId - Optional event_id
 * @param {string|null} gender - Optional gender ('Male' or 'Female')
 * @returns {string} - The complete API URL with event_id parameter
 */
export const buildApiUrlWithYear = (baseUrl, eventId = null, gender = null) => {
  if (!baseUrl) return ''
  const params = []
  if (eventId) {
    params.push(`event_id=${encodeURIComponent(String(eventId).trim())}`)
  }
  if (gender && (gender === 'Male' || gender === 'Female')) params.push(`gender=${encodeURIComponent(gender)}`)
  const queryString = params.length > 0 ? `?${params.join('&')}` : ''
  return `${baseUrl}${queryString}`
}

