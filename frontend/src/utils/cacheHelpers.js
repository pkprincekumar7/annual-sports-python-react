/**
 * Cache clearing utilities for consistent cache management
 */

import { clearCache, clearCachePattern } from './api'
import { buildApiUrlWithYear } from './apiHelpers'

/**
 * Clear all caches related to a specific sport and event
 * @param {string} sportName - The sport name
 * @param {string|null} eventId - The event_id
 */
export const clearSportCaches = (sportName, eventId = null) => {
  if (!sportName) return
  
  const encodedSport = encodeURIComponent(sportName)
  
  clearCache(buildApiUrlWithYear(`/sports-participations/teams/${encodedSport}`, eventId))
  clearCache(buildApiUrlWithYear(`/sports-participations/participants/${encodedSport}`, eventId))
  clearCache(
    buildApiUrlWithYear(`/sports-participations/participants-count/${encodedSport}`, eventId)
  )
  clearCache(buildApiUrlWithYear(`/schedulings/event-schedule/${encodedSport}`, eventId))
  clearCache(
    buildApiUrlWithYear(`/schedulings/event-schedule/${encodedSport}/teams-players`, eventId)
  )
  clearCache(buildApiUrlWithYear('/sports-participations/sports-counts', eventId))
}

/**
 * Clear caches after team participation changes
 * @param {string} sportName - The sport name
 * @param {string|null} eventId - The event_id
 */
export const clearTeamParticipationCaches = (sportName, eventId = null) => {
  clearSportCaches(sportName, eventId)
  clearCachePattern('/identities/players')
  clearCachePattern('/identities/me') // Current user's participation data changes (clear all variations)
  clearCachePattern('/sports-participations/sports-counts')
  clearCachePattern('/schedulings/event-schedule')
}

/**
 * Clear caches after individual participation changes
 * @param {string} sportName - The sport name
 * @param {string|null} eventId - The event_id
 */
export const clearIndividualParticipationCaches = (sportName, eventId = null) => {
  clearSportCaches(sportName, eventId)
  clearCachePattern('/identities/players')
  clearCachePattern('/identities/me') // Current user's participation data changes (clear all variations)
  clearCachePattern('/sports-participations/sports-counts')
  clearCachePattern('/schedulings/event-schedule')
}

/**
 * Clear caches after sport changes (create/update/delete)
 * @param {string|null} eventId - The event_id
 */
export const clearSportManagementCaches = (eventId = null) => {
  clearCache(buildApiUrlWithYear('/sports-participations/sports', eventId))
  clearCache(buildApiUrlWithYear('/sports-participations/sports-counts', eventId))
}

