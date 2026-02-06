import { useState, useEffect, useRef } from 'react'
import { Modal, Button, LoadingSpinner, ErrorMessage, EmptyState } from './ui'
import { fetchWithAuth, clearCache } from '../utils/api'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import { useEventYearWithFallback, useApi, useEventYears } from '../hooks'
import logger from '../utils/logger'
import { isCoordinatorForSportScope } from '../utils/sportHelpers'

function PointsTableModal({ isOpen, onClose, sport, sportDetails = null, loggedInUser, embedded = false, selectedEventId, isActive = true, onStatusPopup }) {
  const [pointsTable, setPointsTable] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedGender, setSelectedGender] = useState('Male') // Default to Male
  const [hasLeagueMatches, setHasLeagueMatches] = useState(true) // Assume true initially
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const { loading: eventYearsLoading } = useEventYears()
  const abortControllerRef = useRef(null)
  const currentSportRef = useRef(null)
  const previousIsActiveRef = useRef(false)
  const isAdmin = loggedInUser?.reg_number === 'admin'
  const isCoordinator = !isAdmin && isCoordinatorForSportScope(loggedInUser, sport, sportDetails)
  const canManageSport = isAdmin || isCoordinator
  const { loading: backfilling, execute: executeBackfill } = useApi()

  useEffect(() => {
    if (!isOpen || !sport) {
      setPointsTable([])
      setError(null)
      setLoading(false)
      currentSportRef.current = null
      previousIsActiveRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      return
    }

    // Refresh when tab becomes active (user switches to Points Table tab)
    const becameActive = isActive && !previousIsActiveRef.current
    previousIsActiveRef.current = isActive

    // Only fetch if sport, eventYear, or gender changed, we haven't fetched yet, or tab became active
    const currentKey = `${sport}-${eventYear}-${selectedGender}`
    if (currentSportRef.current === currentKey && !becameActive) {
      return
    }

    // Reset ref if tab became active to force refresh
    if (becameActive) {
      currentSportRef.current = null
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
      await fetchPointsTable(abortController.signal)
    }

    loadData()

    return () => {
      isMounted = false
      // Only abort if sport, eventYear, or gender changed
      const currentKey = `${sport}-${eventYear}-${selectedGender}`
      if (currentSportRef.current !== currentKey) {
        abortController.abort()
      }
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sport, eventYear, isActive, selectedGender])

  const fetchPointsTable = async (signal) => {
    if (!sport) {
      setError('Sport name is required')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    let isMounted = true

    try {
      const encodedSport = encodeURIComponent(sport)
      const url = buildApiUrlWithYear(`/scorings/points-table/${encodedSport}`, eventId, selectedGender)

      const response = await fetchWithAuth(url, { signal })

      if (signal?.aborted) {
        isMounted = false
        return
      }

      if (!response.ok) {
        let errorMessage = 'Failed to fetch points table'
        try {
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

      if (isMounted) {
        if (data.success) {
          setPointsTable(data.points_table || [])
          // Store has_league_matches flag for better empty state messaging
          if (data.has_league_matches !== undefined) {
            // This will be used in empty state message
            setHasLeagueMatches(data.has_league_matches)
          }
        } else {
          setError(data.error || 'Failed to fetch points table')
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        isMounted = false
        return
      }
      logger.error('Error fetching points table:', err)
      if (isMounted) {
        setError(`Error while fetching points table: ${err.message || 'Please check your connection and try again.'}`)
      }
    } finally {
      if (isMounted) {
        setLoading(false)
      }
    }
  }

  const handleBackfill = async () => {
    if (!sport) {
      if (onStatusPopup) {
        onStatusPopup('❌ Sport is required for backfill.', 'error', 3000)
      }
      return
    }

    // Wait for event data to load if still loading
    if (eventYearsLoading) {
      if (onStatusPopup) {
        onStatusPopup('❌ Please wait for event data to load before refreshing points table.', 'error', 3000)
      }
      return
    }

    try {
      await executeBackfill(
        () => fetchWithAuth(buildApiUrlWithYear(`/scorings/points-table/backfill/${encodeURIComponent(sport)}`, eventId), {
          method: 'POST',
        }),
        {
          onSuccess: (data) => {
            const message = data.message || `Backfill completed: ${data.processed || 0} matches processed, ${data.created || 0} entries created.`
            if (onStatusPopup) {
              onStatusPopup(`✅ ${message}`, 'success', 4000)
            }
            // Clear cache and refresh points table
            clearCache(buildApiUrlWithYear(`/scorings/points-table/${encodeURIComponent(sport)}`, eventId, 'Male'))
            clearCache(buildApiUrlWithYear(`/scorings/points-table/${encodeURIComponent(sport)}`, eventId, 'Female'))
            // Reset current sport ref to force refresh
            currentSportRef.current = null
            // Refresh points table (create new abort controller for refresh)
            const refreshAbortController = new AbortController()
            abortControllerRef.current = refreshAbortController
            fetchPointsTable(refreshAbortController.signal)
          },
          onError: (err) => {
            // The useApi hook extracts the error message from the API response
            // Backend returns { success: false, error: "message" } with status 400
            // useApi checks !response.ok, clones response, parses JSON, extracts errorData.error
            // and sets err.message from errorData.error || errorData.message
            const errorMessage = err?.message || err?.error || 'Error backfilling points table. Please try again.'
            logger.error('Backfill error details:', { 
              message: err?.message, 
              error: err?.error, 
              status: err?.status,
              fullError: err 
            })
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
            }
          },
        }
      )
    } catch (err) {
      // This catch handles cases where execute throws before onError is called
      // Don't show duplicate error message - onError should have handled it
      logger.error('Error in handleBackfill:', err)
      // onError callback should have already displayed the error message
      // Only log here, don't show duplicate error popup
    }
  }

  if (!embedded) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`${sport} - Points Table`}
        subtitle="League Match Standings"
        maxWidth="max-w-[900px]"
      >
        {/* Gender Selection Tabs and Refresh Button */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => setSelectedGender('Male')}
              className={`px-4 py-2 rounded-lg text-[0.85rem] font-bold transition-all duration-200 ${
                selectedGender === 'Male'
                  ? 'bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.3)]'
                  : 'bg-[rgba(255,255,255,0.05)] text-[#cbd5ff] hover:bg-[rgba(255,255,255,0.1)] border border-transparent'
              }`}
            >
              Male
            </button>
            <button
              type="button"
              onClick={() => setSelectedGender('Female')}
              className={`px-4 py-2 rounded-lg text-[0.85rem] font-bold transition-all duration-200 ${
                selectedGender === 'Female'
                  ? 'bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.3)]'
                  : 'bg-[rgba(255,255,255,0.05)] text-[#cbd5ff] hover:bg-[rgba(255,255,255,0.1)] border border-transparent'
              }`}
            >
              Female
            </button>
          </div>
          {canManageSport && (
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={handleBackfill}
                disabled={backfilling || loading}
                loading={backfilling}
                variant="secondary"
                className="px-4 py-2 text-[0.85rem] font-bold rounded-lg"
                title="Backfill points table entries for existing completed league matches"
              >
                {backfilling ? 'Refreshing...' : '🔄 Refresh Points Table'}
              </Button>
            </div>
          )}
        </div>
        {loading && <LoadingSpinner />}
        {error && <ErrorMessage message={error} />}
        {!loading && !error && pointsTable.length === 0 && (
          <EmptyState 
            message={
              hasLeagueMatches
                ? "No points table data available yet. Points are calculated automatically for league matches. If you see completed league matches, try clicking the 'Refresh Points Table' button."
                : "No points table data available. Points table only tracks league matches, not knockout or final matches. Please schedule league matches first to see points table entries."
            } 
          />
        )}
        {!loading && !error && pointsTable.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[rgba(148,163,184,0.3)]">
                  <th className="px-4 py-3 text-left text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Rank</th>
                  <th className="px-4 py-3 text-left text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">
                    {pointsTable[0]?.participant_type === 'team' ? 'Team' : 'Player'}
                  </th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Matches Played</th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Won</th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Lost</th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Draw</th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Cancelled</th>
                  <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Points</th>
                </tr>
              </thead>
              <tbody>
                {pointsTable.map((entry, index) => (
                  <tr key={entry._id || index} className="border-b border-[rgba(148,163,184,0.1)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3 text-[#e5e7eb] font-semibold">{index + 1}</td>
                    <td className="px-4 py-3 text-[#e5e7eb]">{entry.participant}</td>
                    <td className="px-4 py-3 text-center text-[#e5e7eb]">{entry.matches_played || 0}</td>
                    <td className="px-4 py-3 text-center text-[#86efac]">{entry.matches_won || 0}</td>
                    <td className="px-4 py-3 text-center text-[#f87171]">{entry.matches_lost || 0}</td>
                    <td className="px-4 py-3 text-center text-[#fbbf24]">{entry.matches_draw || 0}</td>
                    <td className="px-4 py-3 text-center text-[#94a3b8]">{entry.matches_cancelled || 0}</td>
                    <td className="px-4 py-3 text-center text-[#ffe66d] font-bold text-[1.1rem]">{entry.points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    )
  }

  // Embedded mode (inside SportDetailsModal)
  return (
    <div className="p-4">
      {/* Gender Selection Tabs and Refresh Button */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => setSelectedGender('Male')}
            className={`px-4 py-2 rounded-lg text-[0.85rem] font-bold transition-all duration-200 ${
              selectedGender === 'Male'
                ? 'bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.3)]'
                : 'bg-[rgba(255,255,255,0.05)] text-[#cbd5ff] hover:bg-[rgba(255,255,255,0.1)] border border-transparent'
            }`}
          >
            Male
          </button>
          <button
            type="button"
            onClick={() => setSelectedGender('Female')}
            className={`px-4 py-2 rounded-lg text-[0.85rem] font-bold transition-all duration-200 ${
              selectedGender === 'Female'
                ? 'bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.3)]'
                : 'bg-[rgba(255,255,255,0.05)] text-[#cbd5ff] hover:bg-[rgba(255,255,255,0.1)] border border-transparent'
            }`}
          >
            Female
          </button>
        </div>
        {canManageSport && (
          <div className="flex justify-center">
            <Button
              type="button"
              onClick={handleBackfill}
              disabled={backfilling || loading}
              loading={backfilling}
              variant="secondary"
              className="px-4 py-2 text-[0.85rem] font-bold rounded-lg"
              title="Backfill points table entries for existing completed league matches"
            >
              {backfilling ? 'Refreshing...' : '🔄 Refresh Points Table'}
            </Button>
          </div>
        )}
      </div>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && pointsTable.length === 0 && (
        <EmptyState 
          message={
            hasLeagueMatches
              ? "No points table data available yet. Points are calculated automatically for league matches. If you see completed league matches, try clicking the 'Refresh Points Table' button."
              : "No points table data available. Points table only tracks league matches, not knockout or final matches. Please schedule league matches first to see points table entries."
          } 
        />
      )}
      {!loading && !error && pointsTable.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[rgba(148,163,184,0.3)]">
                <th className="px-4 py-3 text-left text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Rank</th>
                <th className="px-4 py-3 text-left text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">
                  {pointsTable[0]?.participant_type === 'team' ? 'Team' : 'Player'}
                </th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Matches Played</th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Won</th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Lost</th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Draw</th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Cancelled</th>
                <th className="px-4 py-3 text-center text-[0.85rem] font-bold text-[#ffe66d] uppercase tracking-[0.05em]">Points</th>
              </tr>
            </thead>
            <tbody>
              {pointsTable.map((entry, index) => (
                <tr key={entry._id || index} className="border-b border-[rgba(148,163,184,0.1)] hover:bg-[rgba(255,255,255,0.02)]">
                  <td className="px-4 py-3 text-[#e5e7eb] font-semibold">{index + 1}</td>
                  <td className="px-4 py-3 text-[#e5e7eb]">{entry.participant}</td>
                  <td className="px-4 py-3 text-center text-[#e5e7eb]">{entry.matches_played || 0}</td>
                  <td className="px-4 py-3 text-center text-[#86efac]">{entry.matches_won || 0}</td>
                  <td className="px-4 py-3 text-center text-[#f87171]">{entry.matches_lost || 0}</td>
                  <td className="px-4 py-3 text-center text-[#fbbf24]">{entry.matches_draw || 0}</td>
                  <td className="px-4 py-3 text-center text-[#94a3b8]">{entry.matches_cancelled || 0}</td>
                  <td className="px-4 py-3 text-center text-[#ffe66d] font-bold text-[1.1rem]">{entry.points || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PointsTableModal

