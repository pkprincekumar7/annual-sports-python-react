import { useState, useEffect, useRef } from 'react'
import { Modal, Button, Input, EmptyState, ConfirmationDialog } from './ui'
import { useApi, useModal, useEventYearWithFallback, useEventYear } from '../hooks'
import { fetchWithAuth, clearCache } from '../utils/api'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import { formatSportName } from '../utils/stringHelpers'
import { isCoordinatorForSportScope } from '../utils/sportHelpers'
import logger from '../utils/logger'
import { shouldDisableDatabaseOperations } from '../utils/yearHelpers'

const TABS = {
  ADD: 'add',
  REMOVE: 'remove'
}

function CaptainManagementModal({ isOpen, onClose, onStatusPopup, selectedEventId, loggedInUser }) {
  const [activeTab, setActiveTab] = useState(TABS.ADD)
  
  // Add Captain State
  const [players, setPlayers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedSport, setSelectedSport] = useState('')
  const [sports, setSports] = useState([])
  
  // Remove Captain State
  const [captainsBySport, setCaptainsBySport] = useState({})
  const [expandedSports, setExpandedSports] = useState({})
  const [captainToRemove, setCaptainToRemove] = useState(null)
  const isRefreshingRef = useRef(false)
  
  const { loading, execute } = useApi()
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const { eventYearConfig } = useEventYear()
  const confirmModal = useModal(false)
  const isAdmin = loggedInUser?.reg_number === 'admin'
  
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
          const teamSports = sportsData.filter(s => s.type === 'dual_team' || s.type === 'multi_team')
          const visibleSports = isAdmin ? teamSports : teamSports.filter(s => isCoordinatorForSportScope(loggedInUser, s.name, s))
          setSports(visibleSports)
        } else if (sportsData.success) {
          const teamSports = (sportsData.sports || []).filter(s => s.type === 'dual_team' || s.type === 'multi_team')
          const visibleSports = isAdmin ? teamSports : teamSports.filter(s => isCoordinatorForSportScope(loggedInUser, s.name, s))
          setSports(visibleSports)
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
  }, [isOpen, eventYear, activeTab, isAdmin, loggedInUser])

  // Fetch captains by sport for Remove tab
  useEffect(() => {
    if (isOpen && activeTab === TABS.REMOVE && eventYear) {
      fetchWithAuth(buildApiUrlWithYear('/sports-participations/captains-by-sport', eventId))
        .then((res) => {
          if (!res.ok) {
            if (res.status >= 500) {
              throw new Error(`HTTP error! status: ${res.status}`)
            }
            return res.json().then(data => ({ success: true, captainsBySport: {} }))
          }
          return res.json()
        })
        .then((data) => {
          if (data.success) {
            const captains = data.captainsBySport || {}
            const filteredCaptains = isAdmin
              ? captains
              : Object.keys(captains).reduce((acc, sportName) => {
                if (isCoordinatorForSportScope(loggedInUser, sportName)) {
                  acc[sportName] = captains[sportName]
                }
                return acc
              }, {})
            setCaptainsBySport(filteredCaptains)
          } else {
            setCaptainsBySport({})
            if (!isRefreshingRef.current && onStatusPopup && data.error) {
              onStatusPopup(`❌ ${data.error}`, 'error', 2500)
            }
          }
        })
        .catch((err) => {
          setCaptainsBySport({})
          if (!isRefreshingRef.current && onStatusPopup && err.message && !err.message.includes('HTTP error')) {
            onStatusPopup('❌ Error fetching captains. Please try again.', 'error', 2500)
          }
        })
    }
  }, [isOpen, eventYear, activeTab, isAdmin, loggedInUser])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(TABS.ADD)
      setSearchQuery('')
      setSelectedPlayer(null)
      setSelectedSport('')
      setExpandedSports({})
      confirmModal.close()
      setCaptainToRemove(null)
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
        () => fetchWithAuth('/sports-participations/add-captain', {
          method: 'POST',
          body: JSON.stringify({
            reg_number: selectedPlayer.reg_number,
            sport: selectedSport.trim(),
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            clearCache(buildApiUrlWithYear('/sports-participations/captains-by-sport', eventId))
            clearCache(buildApiUrlWithYear('/identities/players', eventId))
            clearCache(buildApiUrlWithYear('/identities/me', eventId))
            clearCache(buildApiUrlWithYear('/sports-participations/sports', eventId))
            
            onStatusPopup(
              `✅ ${selectedPlayer.full_name} has been added as captain for ${selectedSport}!`,
              'success',
              3000
            )
            setSelectedPlayer(null)
            setSearchQuery('')
            setSelectedSport('')
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error adding captain. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
          },
        }
      )
    } catch (err) {
      logger.error('Error adding captain:', err)
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

  const handleRemoveClick = (regNumber, sport, captainName) => {
    if (isOperationDisabled) {
      onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
      return
    }
    setCaptainToRemove({ regNumber, sport, captainName })
    confirmModal.open()
  }

  const handleConfirmRemove = async () => {
    if (!captainToRemove) return

    if (isOperationDisabled) {
      onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
      confirmModal.close()
      return
    }

    const { regNumber, sport, captainName } = captainToRemove
    confirmModal.close()
    
    try {
      await execute(
        () => fetchWithAuth('/sports-participations/remove-captain', {
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
              `✅ ${captainName} has been removed as captain for ${sport}!`,
              'success',
              3000
            )
            isRefreshingRef.current = true
            clearCache(buildApiUrlWithYear('/sports-participations/captains-by-sport', eventId))
            clearCache(buildApiUrlWithYear('/identities/players', eventId))
            clearCache(buildApiUrlWithYear('/identities/me', eventId))
            clearCache(buildApiUrlWithYear('/sports-participations/sports', eventId))
            
            const captainsUrl = buildApiUrlWithYear('/sports-participations/captains-by-sport', eventId)
            fetchWithAuth(captainsUrl, { skipCache: true })
              .then((res) => {
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`)
                }
                return res.json()
              })
              .then((data) => {
                if (data.success) {
                  setCaptainsBySport(data.captainsBySport || {})
                  const updatedCaptains = data.captainsBySport?.[sport] || []
                  if (updatedCaptains.length === 0) {
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
            setCaptainToRemove(null)
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error removing captain. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
            setCaptainToRemove(null)
          },
        }
      )
    } catch (err) {
      logger.error('Error removing captain:', err)
      setCaptainToRemove(null)
    }
  }

  const handleCancelRemove = () => {
    confirmModal.close()
    setCaptainToRemove(null)
  }

  const sportsWithCaptains = Object.keys(captainsBySport).filter(sport => 
    captainsBySport[sport] && captainsBySport[sport].length > 0
  )
  const hasAnyCaptains = sportsWithCaptains.length > 0

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Captain Management"
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
            Add Captain
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
            Remove Captain
          </button>
        </div>

        {/* Add Captain Tab */}
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

        {/* Remove Captain Tab */}
        {activeTab === TABS.REMOVE && (
          <>
            {!hasAnyCaptains ? (
              <EmptyState message="No captains found. Add captains first." className="py-8 text-[0.9rem]" />
            ) : (
              <div className="space-y-2">
                {sportsWithCaptains.map((sport) => {
                  const captains = captainsBySport[sport] || []
                  if (captains.length === 0) return null

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
                            ({captains.length} captain{captains.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.7)]">
                          {captains.map((captain) => {
                            const hasTeam = captain.participated_in && 
                              Array.isArray(captain.participated_in) &&
                              captain.participated_in.some(p => 
                                p.sport === sport && p.team_name
                              )
                            const teamName = hasTeam 
                              ? captain.participated_in.find(p => p.sport === sport && p.team_name)?.team_name
                              : null

                            return (
                              <div
                                key={captain.reg_number}
                                className="px-[10px] py-3 border-b border-[rgba(148,163,184,0.2)] last:border-b-0"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="text-[#e2e8f0] text-[0.9rem] font-semibold">
                                      {captain.full_name}
                                    </div>
                                    <div className="text-[#cbd5ff] text-[0.8rem]">
                                      Reg. No: {captain.reg_number}
                                    </div>
                                    {hasTeam && (
                                      <div className="text-[#ff6b6b] text-[0.75rem] mt-1">
                                        ⚠️ Has team: {teamName}
                                      </div>
                                    )}
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={() => handleRemoveClick(captain.reg_number, sport, captain.full_name)}
                                    disabled={isOperationDisabled || loading || hasTeam}
                                    title={isOperationDisabled ? operationStatus.reason : (hasTeam ? `Cannot remove: Has team ${teamName}` : "Remove Captain")}
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

      {/* Remove Captain Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmModal.isOpen && captainToRemove !== null}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemove}
        title="Remove Captain"
        message={
          captainToRemove ? (
            <>
              Are you sure you want to remove <span className="font-semibold text-[#ffe66d]">{captainToRemove.captainName}</span> as captain for <span className="font-semibold text-[#ffe66d]">{captainToRemove.sport}</span>?
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

export default CaptainManagementModal
