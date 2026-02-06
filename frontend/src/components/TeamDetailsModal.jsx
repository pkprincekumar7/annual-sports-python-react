import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Modal, Button, Input, ConfirmationDialog, LoadingSpinner, ErrorMessage, EmptyState } from './ui'
import { useApi, useModal, useEventYearWithFallback, useEventYear } from '../hooks'
import { fetchWithAuth, clearCache, clearCachePattern } from '../utils/api'
import { clearSportCaches } from '../utils/cacheHelpers'
import { isCoordinatorForSportScope } from '../utils/sportHelpers'
import { buildSportApiUrl, buildApiUrlWithYear } from '../utils/apiHelpers'
import logger from '../utils/logger'
import { validateGenderMatch, validateBatchMatch, validateNoDuplicates } from '../utils/participantValidation'
import { shouldDisableDatabaseOperations } from '../utils/yearHelpers'

function TeamDetailsModal({ isOpen, onClose, sport, sportDetails = null, loggedInUser, onStatusPopup, embedded = false, selectedEventId }) {
  const { eventYearConfig } = useEventYear()
  const eventHighlight = eventYearConfig?.event_highlight || 'Community Entertainment Fest'
  const [teams, setTeams] = useState([])
  const [totalTeams, setTotalTeams] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expandedTeams, setExpandedTeams] = useState(new Set())
  const [error, setError] = useState(null)
  const [players, setPlayers] = useState([])
  const [editingPlayer, setEditingPlayer] = useState(null) // { team_name, old_reg_number }
  const [selectedReplacementPlayer, setSelectedReplacementPlayer] = useState('')
  const [deletingTeam, setDeletingTeam] = useState(null) // team_name being deleted
  const currentSportRef = useRef(null)
  const abortControllerRef = useRef(null)
  const { loading: updating, execute: executeUpdate } = useApi()
  const { loading: deleting, execute: executeDelete } = useApi()
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const deleteConfirmModal = useModal(false)
  
  // Check if database operations should be disabled
  const operationStatus = shouldDisableDatabaseOperations(eventYearConfig)
  const isOperationDisabled = operationStatus.disabled
  
  const isAdmin = loggedInUser?.reg_number === 'admin'
  const isCoordinator = !isAdmin && isCoordinatorForSportScope(loggedInUser, sport, sportDetails)
  const canManageSport = isAdmin || isCoordinator
  const isCaptain = !canManageSport && loggedInUser?.captain_in && 
    Array.isArray(loggedInUser.captain_in) && 
    loggedInUser.captain_in.includes(sport)

  const hasTeamMatchHistory = useCallback(async (teamName) => {
    if (!teamName || !sport || !eventId) {
      return false
    }

    try {
      const encodedSport = encodeURIComponent(sport)
      const url = buildApiUrlWithYear(`/schedulings/event-schedule/${encodedSport}`, eventId)
      const response = await fetchWithAuth(url)
      if (!response.ok) {
        return true
      }

      const data = await response.json()
      const matches = Array.isArray(data?.matches) ? data.matches : []
      return matches.some(match => Array.isArray(match.teams) && match.teams.includes(teamName))
    } catch (error) {
      logger.error('Failed to check team match history:', error)
      return true
    }
  }, [eventId, sport])
  
  // Check if user is enrolled in this team event (non-captain participant)
  const isEnrolledInTeam = !canManageSport && !isCaptain && loggedInUser?.participated_in && 
    Array.isArray(loggedInUser.participated_in) &&
    loggedInUser.participated_in.some(p => 
      p.sport === sport && p.team_name
    )
  
  // User should see only their team if they are captain or enrolled participant
  const shouldShowOnlyUserTeam = isCaptain || isEnrolledInTeam

  useEffect(() => {
    if (!isOpen || !sport) {
      // Reset state when modal closes
      setTeams([])
      setTotalTeams(0)
      setExpandedTeams(new Set())
      setError(null)
      setEditingPlayer(null)
      setSelectedReplacementPlayer('')
      setDeletingTeam(null)
      deleteConfirmModal.close()
      currentSportRef.current = null
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      return
    }

    // Only fetch if sport or eventYear changed or we haven't fetched yet
    const currentKey = `${sport}-${eventYear}`
    if (currentSportRef.current === currentKey) {
      return
    }

    currentSportRef.current = currentKey

    // Abort previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    let isMounted = true
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const loadData = async () => {
      await fetchTeamDetails(abortController.signal)
      if (canManageSport && isMounted && !abortController.signal.aborted) {
        await fetchPlayers(abortController.signal)
      }
    }

    loadData()

    return () => {
      isMounted = false
      // Only abort if sport or eventYear changed
      const currentKey = `${sport}-${eventYear}`
      if (currentSportRef.current !== currentKey) {
        abortController.abort()
      }
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sport, eventYear])

  const fetchPlayers = async (signal) => {
    try {
      // Don't pass page parameter to get all players (needed for team member replacement)
      const response = await fetchWithAuth(buildApiUrlWithYear('/identities/players', eventId), signal ? { signal } : {})
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
        if (data.success) {
          // Server-side filtering: admin user already filtered out on server
          const playersList = data.players || []
          const filteredPlayers = sport
            ? playersList.filter(player => !isCoordinatorForSport(player, sport))
            : playersList
          setPlayers(filteredPlayers)
      } else {
        logger.warn('Failed to fetch players:', data.error)
        setPlayers([])
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      logger.error('Error fetching players:', err)
      setPlayers([])
    }
  }

  const fetchTeamDetails = async (signal) => {
    if (!sport) {
      setError('Sport name is required')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    let isMounted = true
    
    try {
      // URL encode the sport name to handle special characters like ×
      const url = buildSportApiUrl('teams', sport, eventId)
      // Fetching teams for sport
      
      const response = await fetchWithAuth(url, signal ? { signal } : {})
      
      if (signal?.aborted) {
        isMounted = false
        return
      }
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Failed to fetch team details'
        try {
          // Clone response to read error without consuming the original
          const clonedResponse = response.clone()
          const errorData = await clonedResponse.json()
          errorMessage = errorData.error || errorData.details || errorMessage
          logger.error('API Error:', errorData)
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
          logger.error('Response parse error:', e)
        }
        if (isMounted) {
          setError(errorMessage)
          setLoading(false)
        }
        return
      }

      const data = await response.json()
        // Team data received

      if (isMounted) {
        if (data.success) {
          // Store total teams count from API response
          setTotalTeams(data.total_teams || 0)
          
          let teamsToShow = data.teams || []
          
          // If captain or enrolled participant, filter to show only their team
          if (shouldShowOnlyUserTeam && loggedInUser && teamsToShow.length > 0) {
            // Find the team that the user belongs to
            const userTeam = teamsToShow.find(team => 
              team.players.some(player => player.reg_number === loggedInUser.reg_number)
            )
            
            if (userTeam) {
              // Show only the user's team
              teamsToShow = [userTeam]
              // Auto-expand the user's team
              setExpandedTeams(new Set([userTeam.team_name]))
            } else {
              // User is not in any team (shouldn't happen, but handle gracefully)
              teamsToShow = []
            }
          }
          
          setTeams(teamsToShow)
        } else {
          setError(data.error || 'Failed to fetch team details')
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        isMounted = false
        return
      }
      logger.error('Error fetching team details:', err)
      if (isMounted) {
        setError(`Error while fetching team details: ${err.message || 'Please check your connection and try again.'}`)
      }
    } finally {
      if (isMounted) {
        setLoading(false)
      }
    }
  }

  const toggleTeam = useCallback((teamName) => {
    setExpandedTeams(prev => {
      // If clicking on an already expanded team, collapse it
      if (prev.has(teamName)) {
        const newExpanded = new Set(prev)
        newExpanded.delete(teamName)
        return newExpanded
      }
      // Otherwise, expand this team and collapse all others
      return new Set([teamName])
    })
  }, [])

  const handleEditPlayer = useCallback(async (teamName, regNumber) => {
    setEditingPlayer({ team_name: teamName, old_reg_number: regNumber })
    setSelectedReplacementPlayer('')
    
    // Ensure players are loaded when opening edit mode
    if (canManageSport && players.length === 0) {
      try {
        await fetchPlayers(null)
      } catch (err) {
        logger.error('Error fetching players for replacement:', err)
        if (onStatusPopup) {
          onStatusPopup('❌ Error loading players list. Please try again.', 'error', 3000)
        }
      }
    }
  }, [canManageSport, players.length, fetchPlayers, onStatusPopup])

  const handleCancelEdit = useCallback(() => {
    setEditingPlayer(null)
    setSelectedReplacementPlayer('')
  }, [])

  const handleUpdatePlayer = async () => {
    if (!selectedReplacementPlayer) {
      if (onStatusPopup) {
        onStatusPopup('❌ Please select a replacement player.', 'error', 2500)
      }
      return
    }

    if (!eventId) {
      if (onStatusPopup) {
        onStatusPopup('❌ Event is not configured. Please try again later.', 'error', 3000)
      }
      return
    }

    if (selectedReplacementPlayer === editingPlayer.old_reg_number) {
      if (onStatusPopup) {
        onStatusPopup('❌ Please select a different player.', 'error', 2500)
      }
      return
    }

    // Get current team to validate
    const currentTeam = teams.find(t => t.team_name === editingPlayer.team_name)
    if (!currentTeam) {
      if (onStatusPopup) {
        onStatusPopup('❌ Team not found.', 'error', 2500)
      }
      return
    }

    // Get new player data
    const newPlayer = players.find(p => p.reg_number === selectedReplacementPlayer)
    if (!newPlayer) {
      if (onStatusPopup) {
        onStatusPopup('❌ Selected player not found.', 'error', 2500)
      }
      return
    }

    // Validate gender match
    if (currentTeam.players.length > 0) {
      const teamGender = currentTeam.players[0].gender
      const genderValidation = validateGenderMatch([newPlayer], teamGender)
      if (!genderValidation.isValid) {
        if (onStatusPopup) {
          onStatusPopup(`❌ ${genderValidation.error}`, 'error', 4000)
        }
        return
      }

      // CRITICAL: Validate batch match
      const teamBatch = currentTeam.players[0].batch_name
      const batchValidation = validateBatchMatch([newPlayer], teamBatch)
      if (!batchValidation.isValid) {
        if (onStatusPopup) {
          onStatusPopup(`❌ ${batchValidation.error}`, 'error', 4000)
        }
        return
      }

    }

    // Check for duplicate (new player already in team)
    const teamPlayerIds = currentTeam.players.map(p => p.reg_number)
    const duplicateValidation = validateNoDuplicates([...teamPlayerIds, selectedReplacementPlayer])
    if (!duplicateValidation.isValid) {
      if (onStatusPopup) {
        onStatusPopup('❌ This player is already in the team.', 'error', 2500)
      }
      return
    }

    try {
      await executeUpdate(
        () => fetchWithAuth('/sports-participations/update-team-player', {
          method: 'POST',
          body: JSON.stringify({
            team_name: editingPlayer.team_name,
            sport: sport,
            old_reg_number: editingPlayer.old_reg_number,
            new_reg_number: selectedReplacementPlayer,
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            if (onStatusPopup) {
              onStatusPopup(`✅ Player updated successfully!`, 'success', 2500)
            }
            // Clear cache before refreshing to ensure we get fresh data
            clearSportCaches(sport, eventId)
            clearCachePattern('/identities/me') // Current user's data may have changed (clear all variations)
            clearCachePattern('/identities/players')
            // Refresh team data (no signal needed for manual refresh)
            fetchTeamDetails(null)
            setEditingPlayer(null)
            setSelectedReplacementPlayer('')
          },
          onError: (err) => {
            // The useApi hook extracts the error message from the API response
            const errorMessage = err?.message || err?.error || 'Failed to update player. Please try again.'
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
            }
          },
        }
      )
    } catch (err) {
      // This catch handles cases where execute throws before onError is called
      // Don't show duplicate error message - onError should have handled it
      logger.error('Error updating player:', err)
    }
  }

  const handleDeleteTeam = async (teamName) => {
    deleteConfirmModal.close()
    if (!eventId) {
      if (onStatusPopup) {
        onStatusPopup('❌ Event is not configured. Please try again later.', 'error', 3000)
      }
      return
    }

    const hasMatchHistory = await hasTeamMatchHistory(teamName)
    if (hasMatchHistory) {
      if (onStatusPopup) {
        onStatusPopup('❌ Cannot delete team with match history. Please remove matches first.', 'error', 4000)
      }
      return
    }

    try {
      await executeDelete(
        () => fetchWithAuth('/sports-participations/delete-team', {
          method: 'DELETE',
          body: JSON.stringify({
            team_name: teamName,
            sport: sport,
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            if (onStatusPopup) {
              onStatusPopup(`✅ Team "${teamName}" deleted successfully! ${data.deleted_count || 0} player(s) removed.`, 'success', 3000)
            }
            // Clear cache before refreshing to ensure we get fresh data
            clearSportCaches(sport, eventId)
            clearCachePattern('/identities/me') // If any logged-in user was in this team (clear all variations)
            clearCachePattern('/identities/players')
            // Remove deleted team from expanded teams if it was expanded
            setExpandedTeams(prev => {
              const newSet = new Set(prev)
              newSet.delete(teamName)
              return newSet
            })
            // Refresh team data (no signal needed for manual refresh)
            fetchTeamDetails(null)
            setDeletingTeam(null)
          },
          onError: (err) => {
            // The useApi hook extracts the error message from the API response
            const errorMessage = err?.message || err?.error || 'Failed to delete team. Please try again.'
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
            }
            setDeletingTeam(null)
          },
        }
      )
    } catch (err) {
      // This catch handles cases where execute throws before onError is called
      // Don't show duplicate error message - onError should have handled it
      logger.error('Error deleting team:', err)
      setDeletingTeam(null)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Team Details"
        subtitle={eventHighlight}
        embedded={embedded}
        maxWidth="max-w-[700px]"
      >
        {loading && (
          <LoadingSpinner message="Loading team details..." />
        )}

        {error && (
          <ErrorMessage message={error} />
        )}

        {!loading && !error && (
          <>
            <div className="text-[0.9rem] text-[#cbd5ff] mb-4 text-center">
              Total Teams Participated: <span className="text-[#ffe66d] font-bold">{totalTeams}</span>
            </div>
            {teams.length === 0 && (
              <EmptyState
                message={
                  shouldShowOnlyUserTeam 
                    ? (isCaptain 
                        ? "You haven't created a team for this sport yet. Please register a team first."
                        : "You are not enrolled in any team for this sport yet.")
                    : "No teams registered for this sport yet."
                }
                className="py-8"
              />
            )}
          </>
        )}

        {!loading && !error && teams.length > 0 && (
          <div className="space-y-3">
            {teams.map((team) => {
              const isExpanded = expandedTeams.has(team.team_name)
              // Check if this is the user's team (captain or enrolled participant)
              const isUserTeam = shouldShowOnlyUserTeam && loggedInUser && 
                team.players.some(player => player.reg_number === loggedInUser.reg_number)
              return (
                <div
                  key={team.team_name}
                  className={`border rounded-[12px] overflow-hidden ${
                    isUserTeam 
                      ? 'border-[rgba(255,230,109,0.5)] bg-[rgba(255,230,109,0.05)]' 
                      : 'border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.6)]'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center">
                    <button
                      type="button"
                      onClick={() => toggleTeam(team.team_name)}
                      className="flex-1 px-4 py-3 flex items-center justify-between hover:bg-[rgba(255,230,109,0.1)] transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[#ffe66d] text-lg">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span className="text-[#e5e7eb] font-semibold text-[0.95rem]">
                          {team.team_name}
                        </span>
                        {isUserTeam && (
                          <span className="px-2 py-0.5 rounded text-[0.7rem] font-bold bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.4)]">
                            YOUR TEAM
                          </span>
                        )}
                        <span className="text-[#a5b4fc] text-[0.8rem]">
                          ({team.player_count} {team.player_count === 1 ? 'player' : 'players'})
                        </span>
                      </div>
                    </button>
                    {canManageSport && (
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isOperationDisabled) {
                            onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                            return
                          }
                          setDeletingTeam(team.team_name)
                          deleteConfirmModal.open()
                        }}
                        disabled={isOperationDisabled || (updating && deletingTeam === team.team_name) || (deleting && deletingTeam === team.team_name)}
                        title={isOperationDisabled ? operationStatus.reason : ''}
                        variant="danger"
                        className="self-start mt-2 mb-2 ml-4 md:mt-0 md:mb-0 md:ml-2 md:mr-2 md:self-auto px-4 py-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em] rounded-[8px]"
                      >
                        {(updating && deletingTeam === team.team_name) || (deleting && deletingTeam === team.team_name) ? 'Deleting...' : 'Delete'}
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-[rgba(148,163,184,0.2)]">
                      <div className="space-y-2">
                        {team.players.map((player, index) => {
                          const isEditing = canManageSport && editingPlayer && 
                            editingPlayer.team_name === team.team_name && 
                            editingPlayer.old_reg_number === player.reg_number
                          
                          // Check if this player is the captain (use team.captain field which is more reliable)
                          const isCaptain = team.captain === player.reg_number
                          
                          // Get other selected reg_numbers in the team (for filtering dropdown)
                          const otherSelectedRegNumbers = team.players
                            .filter(p => p.reg_number !== player.reg_number)
                            .map(p => p.reg_number)
                          
                          // Get team gender and batch for filtering
                          const teamGender = team.players.length > 0 ? team.players[0].gender : null
                          const teamBatch = team.players.length > 0 ? team.players[0].batch_name : null

                          return (
                            <div
                              key={player.reg_number}
                              className="px-3 py-2 rounded-[8px] bg-[rgba(15,23,42,0.8)] border border-[rgba(148,163,184,0.15)]"
                            >
                              {!isEditing ? (
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[#ffe66d] font-bold text-[0.85rem]">
                                        {index + 1}.
                                      </span>
                                      <span className="text-[#e5e7eb] font-semibold text-[0.9rem]">
                                        {player.full_name}
                                      </span>
                                      {isCaptain && (
                                        <span className="px-2 py-0.5 rounded text-[0.7rem] font-bold bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.4)]">
                                          CAPTAIN
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[#cbd5ff] text-[0.8rem] ml-6 space-y-0.5">
                                      <div>Reg. No: <span className="text-[#e5e7eb]">{player.reg_number}</span></div>
                                      <div>Department: <span className="text-[#e5e7eb]">{player.department_branch}</span></div>
                                      <div>Batch: <span className="text-[#e5e7eb]">{player.batch_name || ''}</span></div>
                                      <div>Gender: <span className="text-[#e5e7eb]">{player.gender}</span></div>
                                    </div>
                                  </div>
                                  {canManageSport && !isCaptain && (
                                    <Button
                                      type="button"
                                      onClick={() => handleEditPlayer(team.team_name, player.reg_number)}
                                      variant="ghost"
                                      className="ml-3 px-3 py-1.5 text-[0.8rem] font-semibold rounded-[6px]"
                                    >
                                      Edit
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="text-[#cbd5ff] text-[0.85rem] mb-2">
                                    Replace <span className="text-[#ffe66d] font-semibold">{player.full_name} ({player.reg_number})</span> with:
                                  </div>
                                  <Input
                                    label="Select Replacement Player"
                                    type="select"
                                    value={selectedReplacementPlayer}
                                    onChange={(e) => setSelectedReplacementPlayer(e.target.value)}
                                    required
                                    options={players.length === 0 
                                      ? [{ value: '', label: 'Loading players...' }]
                                      : players
                                        .filter((player) => 
                                          player.reg_number !== 'admin' && 
                                          player.gender === teamGender &&
                                          player.batch_name === teamBatch &&
                                          (player.reg_number === selectedReplacementPlayer || !otherSelectedRegNumbers.includes(player.reg_number))
                                        )
                                        .map((player) => ({
                                          value: player.reg_number,
                                          label: `${player.full_name} (${player.reg_number})`
                                        }))
                                    }
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (isOperationDisabled) {
                                          onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                                          return
                                        }
                                        handleUpdatePlayer()
                                      }}
                                      disabled={isOperationDisabled || updating || !selectedReplacementPlayer}
                                      loading={updating}
                                      title={isOperationDisabled ? operationStatus.reason : ''}
                                      className="flex-1 px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-[0.85rem] font-semibold rounded-[8px]"
                                    >
                                      {updating ? 'Updating...' : 'Update'}
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      disabled={updating}
                                      variant="secondary"
                                      className="flex-1 px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-[0.85rem] font-semibold rounded-[8px]"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmModal.isOpen && deletingTeam !== null}
        onClose={() => {
          deleteConfirmModal.close()
          setDeletingTeam(null)
        }}
        onConfirm={() => handleDeleteTeam(deletingTeam)}
        title="Delete Team"
        message={
          deletingTeam ? (
            <>
              Are you sure you want to delete team <span className="font-semibold text-[#ffe66d]">"{deletingTeam}"</span>?
              <br />
              <span className="text-[0.9rem] text-red-400 mt-2 block">This will remove all players from this team. This action cannot be undone.</span>
            </>
          ) : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
        embedded={embedded}
      />
    </>
  )
}

export default TeamDetailsModal

