import { useState, useEffect, useRef } from 'react'
import { Modal, Button, Input, EmptyState, ConfirmationDialog } from './ui'
import { useApi, useModal, useEventYearWithFallback, useEventYear } from '../hooks'
import { fetchWithAuth, clearCache } from '../utils/api'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import { formatSportName } from '../utils/stringHelpers'
import logger from '../utils/logger'
import { shouldDisableDatabaseOperations } from '../utils/yearHelpers'

const TABS = {
  ADD: 'add',
  REMOVE: 'remove'
}

function CoordinatorManagementModal({ isOpen, onClose, onStatusPopup, selectedEventId }) {
  const [activeTab, setActiveTab] = useState(TABS.ADD)
  
  // Add Coordinator State
  const [players, setPlayers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedSport, setSelectedSport] = useState('')
  const [sports, setSports] = useState([])
  
  // Remove Coordinator State
  const [coordinatorsBySport, setCoordinatorsBySport] = useState({})
  const [expandedSports, setExpandedSports] = useState({})
  const [coordinatorToRemove, setCoordinatorToRemove] = useState(null)
  const isRefreshingRef = useRef(false)
  
  const { loading, execute } = useApi()
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const { eventYearConfig } = useEventYear()
  const confirmModal = useModal(false)
  
  // Check if database operations should be disabled
  const operationStatus = shouldDisableDatabaseOperations(eventYearConfig)
  const isOperationDisabled = operationStatus.disabled

  // Fetch players list and sports for Add tab
  useEffect(() => {
    if (!isOpen || activeTab !== TABS.ADD) {
      setPlayers([])
      setSports([])
      return
    }

    let isMounted = true
    const abortController = new AbortController()

    const fetchData = async () => {
      try {
        const [playersRes, sportsRes] = await Promise.all([
          fetchWithAuth(buildApiUrlWithYear('/identities/players', eventId), { signal: abortController.signal }),
          fetchWithAuth(buildApiUrlWithYear('/sports-participations/sports', eventId), { signal: abortController.signal }),
        ])

        if (!isMounted) return

        if (!playersRes.ok) {
          throw new Error(`HTTP error! status: ${playersRes.status} for /identities/players`)
        }
        if (!sportsRes.ok) {
          throw new Error(`HTTP error! status: ${sportsRes.status} for /sports-participations/sports`)
        }

        const [playersData, sportsData] = await Promise.all([
          playersRes.json(),
          sportsRes.json(),
        ])

        if (playersData.success) {
          setPlayers(playersData.players || [])
        }

        if (Array.isArray(sportsData)) {
          setSports(sportsData)
        } else if (sportsData.success) {
          setSports(sportsData.sports || [])
        } else {
          setSports([])
        }
      } catch (err) {
        if (!isMounted || err.name === 'AbortError') return
        setPlayers([])
        setSports([])
      }
    }

    fetchData()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [isOpen, eventYear, activeTab])

  // Fetch coordinators by sport for Remove tab
  useEffect(() => {
    if (isOpen && activeTab === TABS.REMOVE && eventYear) {
      fetchWithAuth(buildApiUrlWithYear('/sports-participations/coordinators-by-sport', eventId))
        .then((res) => {
          if (!res.ok) {
            if (res.status >= 500) {
              throw new Error(`HTTP error! status: ${res.status}`)
            }
            return res.json().then(data => ({ success: true, coordinatorsBySport: {} }))
          }
          return res.json()
        })
        .then((data) => {
          if (data.success) {
            setCoordinatorsBySport(data.coordinatorsBySport || {})
          } else {
            setCoordinatorsBySport({})
            if (!isRefreshingRef.current && onStatusPopup && data.error) {
              onStatusPopup(`❌ ${data.error}`, 'error', 2500)
            }
          }
        })
        .catch((err) => {
          setCoordinatorsBySport({})
          if (!isRefreshingRef.current && onStatusPopup && err.message && !err.message.includes('HTTP error')) {
            onStatusPopup('❌ Error fetching coordinators. Please try again.', 'error', 2500)
          }
        })
    }
  }, [isOpen, eventYear, activeTab])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(TABS.ADD)
      setSearchQuery('')
      setSelectedPlayer(null)
      setSelectedSport('')
      setExpandedSports({})
      confirmModal.close()
      setCoordinatorToRemove(null)
    }
  }, [isOpen]) // Removed confirmModal from dependencies to prevent infinite loop

  // Filter players based on search query
  const filteredPlayers = players.filter((player) =>
    player.reg_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    player.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handlePlayerSelect = (player) => {
    setSelectedPlayer(player)
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()

    if (isOperationDisabled) {
      onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
      return
    }

    if (!selectedPlayer) {
      onStatusPopup('❌ Please select a player.', 'error', 2500)
      return
    }

    if (!selectedSport.trim()) {
      onStatusPopup('❌ Please select a sport.', 'error', 2500)
      return
    }

    try {
      await execute(
        () => fetchWithAuth('/sports-participations/add-coordinator', {
          method: 'POST',
          body: JSON.stringify({
            reg_number: selectedPlayer.reg_number,
            sport: selectedSport.trim(),
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            clearCache(buildApiUrlWithYear('/sports-participations/coordinators-by-sport', eventId))
            clearCache(buildApiUrlWithYear('/identities/players', eventId))
            clearCache(buildApiUrlWithYear('/identities/me', eventId))
            clearCache(buildApiUrlWithYear('/sports-participations/sports', eventId))
            
            onStatusPopup(
              `✅ ${selectedPlayer.full_name} has been added as coordinator for ${selectedSport}!`,
              'success',
              3000
            )
            setSelectedPlayer(null)
            setSearchQuery('')
            setSelectedSport('')
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error adding coordinator. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
          },
        }
      )
    } catch (err) {
      logger.error('Error adding coordinator:', err)
    }
  }

  const toggleSport = (sport) => {
    setExpandedSports(prev => {
      if (prev[sport]) {
        const newState = { ...prev }
        delete newState[sport]
        return newState
      }
      return { [sport]: true }
    })
  }

  const handleRemoveClick = (regNumber, sport, coordinatorName) => {
    setCoordinatorToRemove({ regNumber, sport, coordinatorName })
    confirmModal.open()
  }

  const handleConfirmRemove = async () => {
    if (!coordinatorToRemove) return

    const { regNumber, sport, coordinatorName } = coordinatorToRemove
    confirmModal.close()
    
    try {
      await execute(
        () => fetchWithAuth('/sports-participations/remove-coordinator', {
          method: 'DELETE',
          body: JSON.stringify({
            reg_number: regNumber,
            sport: sport,
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            onStatusPopup(
              `✅ ${coordinatorName} has been removed as coordinator for ${sport}!`,
              'success',
              3000
            )
            isRefreshingRef.current = true
            clearCache(buildApiUrlWithYear('/sports-participations/coordinators-by-sport', eventId))
            clearCache(buildApiUrlWithYear('/identities/players', eventId))
            clearCache(buildApiUrlWithYear('/identities/me', eventId))
            clearCache(buildApiUrlWithYear('/sports-participations/sports', eventId))
            
            const coordinatorsUrl = buildApiUrlWithYear('/sports-participations/coordinators-by-sport', eventId)
            fetchWithAuth(coordinatorsUrl, { skipCache: true })
              .then((res) => {
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`)
                }
                return res.json()
              })
              .then((data) => {
                if (data.success) {
                  setCoordinatorsBySport(data.coordinatorsBySport || {})
                  const updatedCoordinators = data.coordinatorsBySport?.[sport] || []
                  if (updatedCoordinators.length === 0) {
                    setExpandedSports(prev => {
                      const newState = { ...prev }
                      delete newState[sport]
                      return newState
                    })
                  }
                }
              })
              .catch((err) => {
                // Silent error handling
              })
              .finally(() => {
                isRefreshingRef.current = false
              })
            setCoordinatorToRemove(null)
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error removing coordinator. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
            setCoordinatorToRemove(null)
          },
        }
      )
    } catch (err) {
      logger.error('Error removing coordinator:', err)
      setCoordinatorToRemove(null)
    }
  }

  const handleCancelRemove = () => {
    confirmModal.close()
    setCoordinatorToRemove(null)
  }

  const sportsWithCoordinators = Object.keys(coordinatorsBySport).filter(sport => 
    coordinatorsBySport[sport] && coordinatorsBySport[sport].length > 0
  )
  const hasAnyCoordinators = sportsWithCoordinators.length > 0

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Coordinator Management"
        maxWidth="max-w-[700px]"
      >
        {/* Tabs */}
        <div className="flex border-b border-[rgba(148,163,184,0.3)] mb-4">
          <button
            type="button"
            onClick={() => setActiveTab(TABS.ADD)}
            className={`flex-1 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === TABS.ADD
                ? 'text-[#ffe66d] border-b-2 border-[#ffe66d]'
                : 'text-[#cbd5ff] hover:text-[#e2e8f0]'
            }`}
          >
            Add Coordinator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TABS.REMOVE)}
            className={`flex-1 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === TABS.REMOVE
                ? 'text-[#ffe66d] border-b-2 border-[#ffe66d]'
                : 'text-[#cbd5ff] hover:text-[#e2e8f0]'
            }`}
          >
            Remove Coordinator
          </button>
        </div>

        {/* Add Coordinator Tab */}
        {activeTab === TABS.ADD && (
          <form onSubmit={handleAddSubmit}>
            <Input
              label="Search Player (by Registration Number or Name)"
              id="searchPlayer"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type registration number or name to search..."
            />

            <div className="flex flex-col mb-[0.7rem]">
              <label className="text-[0.78rem] uppercase text-[#cbd5ff] mb-1 tracking-[0.06em]">
                Select Player
              </label>
              <div className="max-h-[200px] overflow-y-auto border border-[rgba(148,163,184,0.6)] rounded-[10px] bg-[rgba(15,23,42,0.9)]">
                {searchQuery ? (
                  filteredPlayers.length > 0 ? (
                    filteredPlayers.map((player) => (
                      <div
                        key={player.reg_number}
                        onClick={() => handlePlayerSelect(player)}
                        className={`px-[10px] py-2 cursor-pointer transition-all ${
                          selectedPlayer?.reg_number === player.reg_number
                            ? 'bg-[rgba(255,230,109,0.2)] border-l-2 border-[#ffe66d]'
                            : 'hover:bg-[rgba(148,163,184,0.1)]'
                        }`}
                      >
                        <div className="text-[#e2e8f0] text-[0.9rem] font-semibold">
                          {player.full_name}
                        </div>
                        <div className="text-[#cbd5ff] text-[0.8rem]">Reg. No: {player.reg_number}</div>
                      </div>
                    ))
                  ) : (
                    <EmptyState message="No players found" className="px-[10px] py-4 text-[0.9rem]" />
                  )
                ) : (
                  <EmptyState message="Type to search for a player" className="px-[10px] py-4 text-[0.9rem]" />
                )}
              </div>
              {selectedPlayer && (
                <div className="mt-2 px-[10px] py-2 rounded-[10px] bg-[rgba(255,230,109,0.1)] border border-[rgba(255,230,109,0.3)]">
                  <div className="text-[#ffe66d] text-[0.85rem] font-semibold">
                    Selected: {selectedPlayer.full_name} ({selectedPlayer.reg_number})
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Select Sport"
              id="sport"
              name="sport"
              type="select"
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              required
              options={sports.map((sport) => ({ value: sport.name, label: formatSportName(sport.name) }))}
            />

            <div className="flex gap-[0.6rem] mt-[0.8rem] justify-center">
              <Button
                type="submit"
                disabled={loading || isOperationDisabled}
                loading={loading}
                title={isOperationDisabled ? operationStatus.reason : ''}
              >
                {loading ? 'Adding...' : 'Submit'}
              </Button>
              <Button
                type="button"
                onClick={onClose}
                disabled={loading}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Remove Coordinator Tab */}
        {activeTab === TABS.REMOVE && (
          <>
            {!hasAnyCoordinators ? (
              <EmptyState message="No coordinators found. Add coordinators first." className="py-8 text-[0.9rem]" />
            ) : (
              <div className="space-y-2">
                {sportsWithCoordinators.map((sport) => {
                  const coordinators = coordinatorsBySport[sport] || []
                  if (coordinators.length === 0) return null

                  const isExpanded = expandedSports[sport]

                  return (
                    <div
                      key={sport}
                      className="border border-[rgba(148,163,184,0.6)] rounded-[10px] bg-[rgba(15,23,42,0.9)] overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSport(sport)}
                        className="w-full px-[10px] py-3 flex items-center justify-between text-left hover:bg-[rgba(148,163,184,0.1)] transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[#ffe66d] text-lg">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                          <span className="text-[#e2e8f0] text-[0.95rem] font-semibold">
                            {sport}
                          </span>
                          <span className="text-[#cbd5ff] text-[0.8rem]">
                            ({coordinators.length} coordinator{coordinators.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.7)]">
                          {coordinators.map((coordinator) => {
                            return (
                              <div
                                key={coordinator.reg_number}
                                className="px-[10px] py-3 border-b border-[rgba(148,163,184,0.2)] last:border-b-0"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="text-[#e2e8f0] text-[0.9rem] font-semibold">
                                      {coordinator.full_name}
                                    </div>
                                    <div className="text-[#cbd5ff] text-[0.8rem]">
                                      Reg. No: {coordinator.reg_number}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={() => handleRemoveClick(coordinator.reg_number, sport, coordinator.full_name)}
                                    disabled={isOperationDisabled || loading}
                                    title={isOperationDisabled ? operationStatus.reason : "Remove Coordinator"}
                                    variant="danger"
                                    className="px-4 py-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em]"
                                  >
                                    {loading ? 'Removing...' : 'Remove'}
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Remove Coordinator Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmModal.isOpen && coordinatorToRemove !== null}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemove}
        title="Remove Coordinator"
        message={
          coordinatorToRemove ? (
            <>
              Are you sure you want to remove <span className="font-semibold text-[#ffe66d]">{coordinatorToRemove.coordinatorName}</span> as coordinator for <span className="font-semibold text-[#ffe66d]">{coordinatorToRemove.sport}</span>?
              <br />
              <span className="text-[0.9rem] text-red-400 mt-2 block">This action cannot be undone.</span>
            </>
          ) : ''
        }
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        loading={loading}
      />
    </>
  )
}

export default CoordinatorManagementModal
