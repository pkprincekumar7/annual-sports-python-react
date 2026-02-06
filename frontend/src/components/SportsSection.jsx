import { useState, useEffect, useRef } from 'react'
import { fetchWithAuth } from '../utils/api'
import { clearSportManagementCaches } from '../utils/cacheHelpers'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import { useEventYearWithFallback } from '../hooks'
import logger from '../utils/logger'
import { LoadingSpinner, EmptyState } from './ui'
import { formatSportName } from '../utils/stringHelpers'
import { isCoordinatorForSportScope } from '../utils/sportHelpers'


function SportCard({ sport, type, onSportClick, onEventScheduleClick, loggedInUser, isEnrolled, isCaptain, isCoordinator, canCreateOrViewTeam, teamsCount, participantsCount }) {
  const isAdmin = loggedInUser?.reg_number === 'admin'
  
  // Use props if provided, otherwise default to -1 (loading state)
  const displayTeamsCount = teamsCount !== undefined ? teamsCount : -1
  const displayParticipantsCount = participantsCount !== undefined ? participantsCount : -1

  // Check if user is enrolled (as individual, team member, or captain) - for non-admin users only
  const isUserEnrolled = !isAdmin && isEnrolled === true

  // Check if user can create team (for team events only)
  const canCreateTeam = !isAdmin && type === 'team' && isCaptain === true && !isEnrolled

  const handleCardClick = () => {
    // Map sport type to expected format
    const sportType = (sport.type === 'dual_team' || sport.type === 'multi_team') ? 'team' : 'individual'
    onSportClick({ 
      name: sport.name, 
      type: sportType, 
      players: sport.team_size || 0,
      sportType: sport.type // Pass original type for backend compatibility
    })
  }

  const handleEventScheduleClick = (e) => {
    e.stopPropagation()
    if (onEventScheduleClick) {
      const sportType = (sport.type === 'dual_team' || sport.type === 'multi_team') ? 'team' : 'individual'
      onEventScheduleClick({ name: sport.name, type: sportType })
    }
  }

  const cardClasses = "relative min-h-[170px] rounded-[18px] overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.75)] cursor-pointer translate-y-0 transition-all duration-[0.25s] ease-in-out hover:-translate-y-2 hover:shadow-[0_26px_55px_rgba(0,0,0,0.9)]"
  const imageUrl = sport.imageUri || '/images/default-sport.jpg'

  return (
    <div
      className={cardClasses}
      style={{
        background: 'radial-gradient(circle at 0 0, #ffe66d 0, #7f1d1d 50%, #020617 100%)',
      }}
      onClick={handleCardClick}
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{ backgroundImage: `url('${imageUrl}')` }}
      />
      {/* Badges */}
      {(isCoordinator || isUserEnrolled || canCreateTeam) && (
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 items-end">
          {isCoordinator && (
            <div className="px-2 py-0.5 rounded-md bg-gradient-to-r from-[#14b8a6] to-[#0f766e] text-white text-[0.7rem] font-bold uppercase tracking-[0.1em] shadow-[0_2px_8px_rgba(20,184,166,0.5)]">
              Coordinator
            </div>
          )}
          {isUserEnrolled && (
            <div className="px-2 py-0.5 rounded-md bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white text-[0.7rem] font-bold uppercase tracking-[0.1em] shadow-[0_2px_8px_rgba(34,197,94,0.5)] animate-pulse">
              Enrolled!
            </div>
          )}
          {canCreateTeam && (
            <div className="px-2 py-0.5 rounded-md bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white text-[0.7rem] font-bold uppercase tracking-[0.1em] shadow-[0_2px_8px_rgba(59,130,246,0.5)] animate-pulse">
              Create Team
            </div>
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.9)] to-[rgba(0,0,0,0.2)] flex flex-col justify-end p-[0.9rem] px-[1.1rem] text-[#f9fafb] drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)] z-10">
        <div className="text-[1.1rem] font-extrabold text-[#ffe66d] uppercase">{formatSportName(sport.name)}</div>
        {loggedInUser && (
          <div className="text-[0.8rem] mt-2 font-bold text-[#06b6d4] drop-shadow-[0_2px_8px_rgba(0,0,0,1)]" style={{ zIndex: 20 }}>
            {type === 'team' ? (
              displayTeamsCount < 0 ? 'Loading...' : `${displayTeamsCount} Teams participated`
            ) : (
              displayParticipantsCount < 0 ? 'Loading...' : `${displayParticipantsCount} Players participated`
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SportsSection({ onSportClick, onEventScheduleClick, loggedInUser, selectedEventId }) {
  const [sports, setSports] = useState([])
  const [sportsCounts, setSportsCounts] = useState({
    teams_counts: {},
    participants_counts: {}
  })
  const [loadingSports, setLoadingSports] = useState(false)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [error, setError] = useState(null)
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const prevLoggedInUserRef = useRef(null)
  const hasFetchedRef = useRef(false)

  // Fetch sports from API
  useEffect(() => {
    // Wait for eventId before making API call
    if (!eventId) return

    let isMounted = true
    const abortController = new AbortController()

    const fetchSports = async () => {
      setLoadingSports(true)
      setError(null)
      try {
        const response = await fetchWithAuth(buildApiUrlWithYear('/sports-participations/sports', eventId), {
          signal: abortController.signal,
        })

        if (!isMounted) return

        if (response.ok) {
          const data = await response.json()
          if (isMounted) {
            setSports(data || [])
          }
        } else if (response.status === 404) {
          // 404 means no sports found for this year - treat as empty, not an error
          if (isMounted) {
            setSports([])
            setError(null) // Clear any previous error
          }
        } else if (response.status >= 500) {
          // Only show error for server errors (5xx)
          throw new Error(`Failed to fetch sports: ${response.status}`)
        } else {
          // For other status codes (like 401, 403), treat as empty data
          if (isMounted) {
            setSports([])
            setError(null)
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        if (isMounted) {
          // Only show error for actual network errors or server errors
          if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('500')) {
            logger.error('Error fetching sports:', err)
            setError(err.message || 'Failed to fetch sports')
          } else {
            // For other errors, just log and treat as empty
            logger.warn('Error fetching sports (treating as empty):', err)
            setError(null)
          }
          setSports([])
        }
      } finally {
        if (isMounted) {
          setLoadingSports(false)
        }
      }
    }

    fetchSports()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [eventId])

  // Fetch all sports counts once when user logs in
  useEffect(() => {
    const prevUser = prevLoggedInUserRef.current
    const justLoggedIn = prevUser === null && loggedInUser !== null
    
    // Wait for eventId before making API call
    if (!loggedInUser || !eventId) {
      setSportsCounts({ teams_counts: {}, participants_counts: {} })
      hasFetchedRef.current = false
      prevLoggedInUserRef.current = null
      return
    }

    // Only fetch if:
    // 1. User just logged in (prev was null, now has user), OR
    // 2. We haven't fetched yet (hasFetchedRef is false)
    if (!justLoggedIn && hasFetchedRef.current) {
      prevLoggedInUserRef.current = loggedInUser
      return
    }

    clearSportManagementCaches(eventId)

    let isMounted = true
    const abortController = new AbortController()

    const fetchAllCounts = async () => {
      setLoadingCounts(true)
      try {
        const response = await fetchWithAuth(buildApiUrlWithYear('/sports-participations/sports-counts', eventId), {
          signal: abortController.signal,
        })

        if (!isMounted) return

        if (response.ok) {
          const data = await response.json()
          if (isMounted) {
            setSportsCounts({
              teams_counts: data.teams_counts || {},
              participants_counts: data.participants_counts || {}
            })
            hasFetchedRef.current = true
            prevLoggedInUserRef.current = loggedInUser
          }
        } else {
          logger.warn('Failed to fetch all sports counts:', response.status)
          if (isMounted) {
            setSportsCounts({ teams_counts: {}, participants_counts: {} })
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        if (!isMounted) return
        logger.error('Error fetching all sports counts:', err)
        if (isMounted) {
          setSportsCounts({ teams_counts: {}, participants_counts: {} })
        }
      } finally {
        if (isMounted) {
          setLoadingCounts(false)
        }
      }
    }

    fetchAllCounts()

    return () => {
      isMounted = false
    }
  }, [loggedInUser, eventId])

  // Group sports by category
  const teamSports = sports.filter(s => s.category === 'team events')
  const individualSports = sports.filter(s => s.category === 'individual events')
  const culturalSports = sports.filter(s => s.category === 'literary and cultural activities')

  const isAdmin = loggedInUser?.reg_number === 'admin'

  // Helper function to check if user is enrolled in a sport
  const isEnrolledInSport = (sportName, sportType) => {
    if (!loggedInUser || isAdmin) {
      return false
    }

    if (!loggedInUser.participated_in || !Array.isArray(loggedInUser.participated_in)) {
      return false
    }

    const participation = loggedInUser.participated_in.find(p => p.sport === sportName)
    
    if (!participation) {
      return false
    }

    // For team events: check if user has a team (has team_name)
    if (sportType === 'team') {
      return !!participation.team_name
    }

    // For individual events: check if user has participated (no team_name)
    return !participation.team_name
  }

  // Helper function to check if user is a captain for a sport
  const isCaptainForSport = (sportName) => {
    if (!loggedInUser || isAdmin) {
      return false
    }

    if (!loggedInUser.captain_in || !Array.isArray(loggedInUser.captain_in)) {
      return false
    }

    return loggedInUser.captain_in.includes(sportName)
  }

  // Helper function to check if user is coordinator for a sport
  const isCoordinatorForSportCard = (sport) => {
    if (!loggedInUser || isAdmin) {
      return false
    }
    return isCoordinatorForSportScope(loggedInUser, sport?.name, sport)
  }

  // Helper function to check if user can create or view a team for a sport
  const canCreateOrViewTeam = (sportName) => {
    if (isAdmin) {
      return true // Admin can always view teams
    }
    
    // User can create team if they are a captain and not enrolled
    const isCaptain = isCaptainForSport(sportName)
    const isEnrolled = isEnrolledInSport(sportName, 'team')
    
    // Can create if captain and not enrolled, or can view if enrolled
    return (isCaptain && !isEnrolled) || isEnrolled
  }

  if (loadingSports) {
    return (
      <section id="sports" className="mt-[2.2rem]">
        <LoadingSpinner message="Loading sports..." />
      </section>
    )
  }

  if (error) {
    return (
      <section id="sports" className="mt-[2.2rem]">
        <EmptyState message="Unable to load sports. Please try again later." />
      </section>
    )
  }

  if (sports.length === 0) {
    return (
      <section id="sports" className="mt-[2.2rem]">
        <EmptyState message="No sports available for this event year." />
      </section>
    )
  }

  return (
    <section id="sports" className="mt-[2.2rem]">
      {teamSports.length > 0 && (
        <>
          <h3 className="text-center mt-14 mb-[1.4rem] text-[1.4rem] tracking-[0.16em] uppercase text-[#ffe66d]">
            Team Events
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[1.2rem]">
            {teamSports.map((sport) => (
              <SportCard 
                key={sport.name} 
                sport={sport} 
                type="team" 
                onSportClick={onSportClick}
                onEventScheduleClick={onEventScheduleClick}
                loggedInUser={loggedInUser}
                isEnrolled={isEnrolledInSport(sport.name, 'team')}
                isCaptain={isCaptainForSport(sport.name)}
                isCoordinator={isCoordinatorForSportCard(sport)}
                canCreateOrViewTeam={canCreateOrViewTeam(sport.name)}
                teamsCount={sportsCounts.teams_counts[sport.name?.toLowerCase()]}
                participantsCount={undefined}
              />
            ))}
          </div>
        </>
      )}

      {individualSports.length > 0 && (
        <>
          <h3 className="text-center mt-14 mb-[1.4rem] text-[1.4rem] tracking-[0.16em] uppercase text-[#ffe66d]">
            Individual Events
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[1.2rem]">
            {individualSports.map((sport) => (
              <SportCard 
                key={sport.name} 
                sport={sport} 
                type="individual" 
                onSportClick={onSportClick}
                onEventScheduleClick={onEventScheduleClick}
                loggedInUser={loggedInUser}
                isEnrolled={isEnrolledInSport(sport.name, 'individual')}
                isCaptain={false}
                isCoordinator={isCoordinatorForSportCard(sport)}
                teamsCount={undefined}
                participantsCount={sportsCounts.participants_counts[sport.name?.toLowerCase()]}
              />
            ))}
          </div>
        </>
      )}

      {culturalSports.length > 0 && (
        <>
          <h3 className="text-center mt-14 mb-[1.4rem] text-[1.4rem] tracking-[0.16em] uppercase text-[#ffe88d]">
            Literary & Cultural Activities
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[1.2rem]">
            {culturalSports.map((sport) => (
              <SportCard 
                key={sport.name} 
                sport={sport} 
                type="individual" 
                onSportClick={onSportClick}
                onEventScheduleClick={onEventScheduleClick}
                loggedInUser={loggedInUser}
                isEnrolled={isEnrolledInSport(sport.name, 'individual')}
                isCaptain={false}
                isCoordinator={isCoordinatorForSportCard(sport)}
                teamsCount={undefined}
                participantsCount={sportsCounts.participants_counts[sport.name?.toLowerCase()]}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default SportsSection

