import { useState, useEffect, useRef, useMemo } from 'react'
import TeamDetailsModal from './TeamDetailsModal'
import RegisterModal from './RegisterModal'
import ParticipantDetailsModal from './ParticipantDetailsModal'
import EventScheduleModal from './EventScheduleModal'
import PointsTableModal from './PointsTableModal'
import { formatSportName } from '../utils/stringHelpers'
import { isTeamSport, getSportType, isCaptainForSport, isEnrolledInTeamEvent, hasParticipatedInIndividual, isCoordinatorForSportScope } from '../utils/sportHelpers'
import { fetchWithAuth } from '../utils/api'
import { buildSportApiUrl } from '../utils/apiHelpers'
import { useEventYearWithFallback } from '../hooks'
import logger from '../utils/logger'

function SportDetailsModal({ isOpen, onClose, selectedSport, loggedInUser, onStatusPopup, onUserUpdate, onEventScheduleClick, selectedEventId }) {
  const [activeTab, setActiveTab] = useState(null)
  const hasSetInitialTabRef = useRef(false)
  const lastSportRef = useRef(null)
  const initialTabSetRef = useRef(false)
  const [sportDetails, setSportDetails] = useState(null) // Store fetched sport details with type
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  
  // Fetch sport details to get the type
  useEffect(() => {
    if (!isOpen || !selectedSport?.name || !eventYear) {
      setSportDetails(null)
      return
    }

    const fetchSportDetails = async () => {
      try {
        const response = await fetchWithAuth(buildSportApiUrl('sports', selectedSport.name, eventId))
        if (response.ok) {
          const data = await response.json()
          if (data && data.name) {
            setSportDetails(data)
          }
        }
      } catch (err) {
        logger.error('Error fetching sport details:', err)
        setSportDetails(null)
      }
    }

    fetchSportDetails()
  }, [isOpen, selectedSport?.name, eventYear, eventId])

  // All hooks must be called before any early returns
  // Reset active tab when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(null)
      hasSetInitialTabRef.current = false
      lastSportRef.current = null
      initialTabSetRef.current = false
      setSportDetails(null)
    } else {
      // Reset initial tab flag when modal opens to ensure fresh tab selection
      initialTabSetRef.current = false
    }
  }, [isOpen])
  
  // Set initial active tab when modal opens or sport changes
  useEffect(() => {
    if (!isOpen || !selectedSport) return
    
    // Wait for loggedInUser to be available before determining tabs
    // This prevents Events tab from showing when user data is still loading
    // Check for both undefined and null
    if (loggedInUser === undefined || loggedInUser === null) {
      // User data is still loading, don't set tab yet
      return
    }
    
    // Only set initial tab once per sport, or if sport changes
    const sportChanged = lastSportRef.current !== selectedSport.name
    if (sportChanged) {
      initialTabSetRef.current = false
      lastSportRef.current = selectedSport.name
      // Reset activeTab when sport changes to ensure fresh tab selection
      setActiveTab(null)
    }
    
    const isAdmin = loggedInUser?.reg_number === 'admin'
    const isCoordinator = !isAdmin && isCoordinatorForSportScope(loggedInUser, selectedSport?.name, selectedSport)
    const canManageSport = isAdmin || isCoordinator
    // Get sport type from fetched sportDetails (most reliable) or from selectedSport
    const sportType = sportDetails?.type || getSportType(selectedSport)
    const isTeam = isTeamSport(sportType)
    
    // Check if user is a captain for this sport
    const isCaptainForThisSport = !canManageSport && isCaptainForSport(loggedInUser, selectedSport.name)
    
    // Check if user is enrolled in this team event
    const isEnrolledInTeam = !canManageSport && isEnrolledInTeamEvent(loggedInUser, selectedSport.name)
    
    // Check if user has participated in individual event (recompute on every loggedInUser change)
    const hasParticipatedInIndividualEvent = !canManageSport && selectedSport?.name && hasParticipatedInIndividual(loggedInUser, selectedSport.name)
    
    // Check if sport is dual_team or dual_player (for Points Table tab)
    const isDualSport = sportType === 'dual_team' || sportType === 'dual_player'
    
    // Determine available tabs
    let availableTabs = []
    if (canManageSport) {
      if (isTeam) {
        availableTabs = [
          { id: 'teams', label: 'View Teams' },
          { id: 'events', label: 'Events' }
        ]
      } else {
        availableTabs = [
          { id: 'participants', label: 'View Participants' },
          { id: 'events', label: 'Events' }
        ]
      }
      // Add Points Table tab for dual sports (admin)
      if (isDualSport) {
        availableTabs.push({ id: 'points', label: 'Points Table' })
      }
    } else if (isTeam) {
      // For team sports: 
      // - If captain and not enrolled: Show "Create Team" and "View Events" only
      // - If enrolled (team created): Show "View Team" and "View Events" only
      // - If not captain and not enrolled: Show "View Team" (to see all teams) and "View Events"
      if (isCaptainForThisSport && !isEnrolledInTeam) {
        // Captain can create team - show Create Team tab only (no View Team tab)
        availableTabs.push({ id: 'create', label: 'Create Team' })
      } else {
        // User is enrolled OR not captain - show View Team tab
        availableTabs.push({ id: 'view', label: 'View Team' })
      }
      availableTabs.push({ id: 'events', label: 'View Events' })
      // Add Points Table tab for dual_team sports (non-admin)
      if (isDualSport) {
        availableTabs.push({ id: 'points', label: 'Points Table' })
      }
    } else {
      // For individual sports:
      // - If NOT participated: Show "Enroll Now" first, then "View Events", then "Points Table" (if dual)
      // - If participated: Show "View Enrollment" first, then "View Events", then "Points Table" (if dual)
      
      if (!hasParticipatedInIndividualEvent) {
        // Not participated: "Enroll Now" should be first and auto-selected
        availableTabs.push({ id: 'enroll', label: 'Enroll Now' })
      } else {
        // Already participated: "View Enrollment" should be first and auto-selected
        availableTabs.push({ id: 'view', label: 'View Enrollment' })
      }
      
      // Always show "View Events" and "Points Table" (if dual sport)
      availableTabs.push({ id: 'events', label: 'View Events' })
      // Add Points Table tab for dual_player sports (non-admin) - always show if dual sport
      if (isDualSport) {
        availableTabs.push({ id: 'points', label: 'Points Table' })
      }
    }
    
    // Set active tab synchronously - set to first tab when sport changes or when participation status changes
    if (availableTabs.length > 0) {
      // Use first available tab (which will be "Enroll Now" if not participated, "View Enrollment" if participated)
      const firstTab = availableTabs[0].id
      
      // Set the tab when sport changes, participation status changes, or if current tab is not in available tabs
      const currentTabInvalid = !activeTab || !availableTabs.find(t => t.id === activeTab)
      if (sportChanged || currentTabInvalid) {
        // Sport changed or no valid tab - set to first tab
        initialTabSetRef.current = true
        hasSetInitialTabRef.current = true
        setActiveTab(firstTab)
      } else if (!isTeam && activeTab === 'enroll' && hasParticipatedInIndividualEvent) {
        // If user just participated and "enroll" tab is active, close modal (will reopen with correct tabs next time)
        initialTabSetRef.current = true
        // Don't switch tab - let modal close and reopen with correct tabs
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedSport?.name, loggedInUser, sportDetails])

  // Compute values needed for useMemo (must be before useMemo hook)
  const isAdmin = loggedInUser?.reg_number === 'admin'
  const isCoordinator = !isAdmin && isCoordinatorForSportScope(loggedInUser, selectedSport?.name, selectedSport)
  const canManageSport = isAdmin || isCoordinator
  // Get sport type from fetched sportDetails (most reliable) or from selectedSport
  const sportType = sportDetails?.type || getSportType(selectedSport)
  const isTeam = isTeamSport(sportType)
  
  // Check if user is a captain for this sport (only if selectedSport exists)
  const isCaptainForThisSport = !canManageSport && selectedSport?.name && isCaptainForSport(loggedInUser, selectedSport.name)
  
  // Check if user is enrolled in this team event (only if selectedSport exists)
  const isEnrolledInTeam = !canManageSport && selectedSport?.name && isEnrolledInTeamEvent(loggedInUser, selectedSport.name)
  
  // Check if user has participated in individual event (only if selectedSport exists)
  const hasParticipatedInIndividualEvent = !canManageSport && selectedSport?.name && hasParticipatedInIndividual(loggedInUser, selectedSport.name)

  // Determine sport type for EventScheduleModal (legacy format for compatibility)
  const isCultural = selectedSport && selectedSport.category === 'literary and cultural activities'
  const legacySportType = isTeam ? 'team' : (isCultural ? 'cultural' : 'individual')

  // Memoize tab content to prevent unnecessary remounts
  // This hook MUST be called before any early returns
  const tabContent = useMemo(() => {
    if (!isOpen || !selectedSport || !activeTab) return null
    
    switch (activeTab) {
      case 'create':
        // Only show create team form if user is a captain and not enrolled
        // Recompute here to ensure we have the latest values
        if (isTeam) {
          const isCaptain = !isAdmin && isCaptainForSport(loggedInUser, selectedSport?.name)
          const isEnrolled = !isAdmin && isEnrolledInTeamEvent(loggedInUser, selectedSport?.name)
          
          if (isCaptain && !isEnrolled) {
        return (
          <RegisterModal
            key={`create-${selectedSport.name}`}
            isOpen={true}
            onClose={() => {
              // After successful team creation, close the parent modal
              onClose()
            }}
            selectedSport={selectedSport}
            onStatusPopup={onStatusPopup}
            loggedInUser={loggedInUser}
            onUserUpdate={onUserUpdate}
            embedded={true}
            selectedEventId={selectedEventId}
          />
        )
          }
        }
        // If somehow this tab is active but user is not eligible, show nothing
        return null
      
      case 'view':
        if (isTeam) {
          return (
            <TeamDetailsModal
              key="view-team"
              isOpen={true}
              onClose={onClose}
              sport={selectedSport.name}
              sportDetails={selectedSport}
              loggedInUser={loggedInUser}
              onStatusPopup={onStatusPopup}
              embedded={true}
              selectedEventId={selectedEventId}
            />
          )
        } else {
          // For individual events, show registration modal in view mode
          return (
            <RegisterModal
              key={`view-individual-${selectedSport.name}`}
              isOpen={true}
              onClose={onClose}
              selectedSport={selectedSport}
              onStatusPopup={onStatusPopup}
              loggedInUser={loggedInUser}
              onUserUpdate={onUserUpdate}
              embedded={true}
              selectedEventId={selectedEventId}
            />
          )
        }
      
      case 'teams':
        return (
          <TeamDetailsModal
            key="teams"
            isOpen={true}
            onClose={onClose}
            sport={selectedSport.name}
            sportDetails={selectedSport}
            loggedInUser={loggedInUser}
            onStatusPopup={onStatusPopup}
            embedded={true}
            selectedEventId={selectedEventId}
          />
        )
      
      case 'participants':
        return (
          <ParticipantDetailsModal
            key="participants"
            isOpen={true}
            onClose={onClose}
            sport={selectedSport.name}
            sportDetails={selectedSport}
            loggedInUser={loggedInUser}
            onStatusPopup={onStatusPopup}
            embedded={true}
            selectedEventId={selectedEventId}
          />
        )
      
      case 'events':
        return (
          <EventScheduleModal
            key="events"
            isOpen={true}
            onClose={onClose}
            sport={selectedSport.name}
            sportType={legacySportType}
            sportDetails={selectedSport}
            loggedInUser={loggedInUser}
            onStatusPopup={onStatusPopup}
            embedded={true}
            selectedEventId={selectedEventId}
          />
        )
      
      case 'enroll':
        return (
          <RegisterModal
            key={`enroll-${selectedSport.name}-${hasParticipatedInIndividualEvent ? 'participated' : 'not-participated'}`}
            isOpen={true}
            onClose={() => {
              // After successful individual participation, close the modal
              // Next time it opens, it will show "View Enrollment" tab first
              onClose()
            }}
            selectedSport={selectedSport}
            onStatusPopup={onStatusPopup}
            loggedInUser={loggedInUser}
            onUserUpdate={(updatedUser) => {
              // Update user data
              if (onUserUpdate) {
                onUserUpdate(updatedUser)
              }
              // After successful participation, close the modal
              // The modal will close automatically via RegisterModal's onClose after success
            }}
            embedded={true}
            selectedEventId={selectedEventId}
          />
        )
      
      case 'points':
        return (
          <PointsTableModal
            key={`points-${selectedSport.name}-${eventYear}`}
            isOpen={true}
            onClose={onClose}
            sport={selectedSport.name}
            sportDetails={selectedSport}
            loggedInUser={loggedInUser}
            embedded={true}
            selectedEventId={selectedEventId}
            isActive={activeTab === 'points'}
            onStatusPopup={onStatusPopup}
          />
        )
      
      default:
        return null
    }
  }, [activeTab, selectedSport?.name, isTeam, legacySportType, isOpen, onClose, loggedInUser, onStatusPopup, onUserUpdate, isCaptainForThisSport, isEnrolledInTeam, selectedEventId])

  // Determine available tabs based on user type and sport type
  const getAvailableTabs = () => {
    if (!selectedSport) return []
    
    // Wait for loggedInUser to be available (check for both undefined and null)
    if (loggedInUser === undefined || loggedInUser === null) {
      return []
    }
    
    // Get sport type from fetched sportDetails (most reliable) or from selectedSport
    const currentSportType = sportDetails?.type || getSportType(selectedSport)
    const currentIsTeam = isTeamSport(currentSportType)
    const isDualSport = currentSportType === 'dual_team' || currentSportType === 'dual_player'
    
    if (canManageSport) {
      const tabs = []
      if (currentIsTeam) {
        tabs.push({ id: 'teams', label: 'View Teams' })
      } else {
        tabs.push({ id: 'participants', label: 'View Participants' })
      }
      tabs.push({ id: 'events', label: 'Events' })
      // Add Points Table tab for dual sports (admin)
      if (isDualSport) {
        tabs.push({ id: 'points', label: 'Points Table' })
      }
      return tabs
    }
    
    if (currentIsTeam) {
      const tabs = []
      // Can create team if captain and not enrolled
      // Recompute here to ensure we have the latest values
      const isCaptain = !canManageSport && isCaptainForSport(loggedInUser, selectedSport?.name)
      const isEnrolled = !canManageSport && isEnrolledInTeamEvent(loggedInUser, selectedSport?.name)
      
      // For team sports: 
      // - If captain and not enrolled: Show "Create Team" and "View Events" only
      // - If enrolled (team created): Show "View Team" and "View Events" only
      // - If not captain and not enrolled: Show "View Team" (to see all teams) and "View Events"
      if (isCaptain && !isEnrolled) {
        // Captain can create team - show Create Team tab only (no View Team tab)
        tabs.push({ id: 'create', label: 'Create Team' })
      } else {
        // User is enrolled OR not captain - show View Team tab
        tabs.push({ id: 'view', label: 'View Team' })
      }
      // Always show events
      tabs.push({ id: 'events', label: 'View Events' })
      // Add Points Table tab for dual_team sports (non-admin)
      if (isDualSport) {
        tabs.push({ id: 'points', label: 'Points Table' })
      }
      return tabs
    } else {
      // Individual/cultural events
      const tabs = []
      
      // Check participation status
      const hasParticipated = !canManageSport && hasParticipatedInIndividual(loggedInUser, selectedSport?.name)
      
      if (!hasParticipated) {
        // Not participated: "Enroll Now" should be first
        tabs.push({ id: 'enroll', label: 'Enroll Now' })
      } else {
        // Already participated: "View Enrollment" should be first
        tabs.push({ id: 'view', label: 'View Enrollment' })
      }
      
      // Always show "View Events" and "Points Table" (if dual sport)
      tabs.push({ id: 'events', label: 'View Events' })
      // Add Points Table tab for dual_player sports (non-admin) - always show if dual sport
      if (isDualSport) {
        tabs.push({ id: 'points', label: 'Points Table' })
      }
      return tabs
    }
  }

  const availableTabs = getAvailableTabs()

  // Events tab is now enabled, so we can show the popup even if Events is the only tab

  if (!isOpen || !selectedSport) return null

  const handleClose = (e) => {
    e?.stopPropagation()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.65)] flex items-center justify-center z-[200] p-4">
      <div className="max-w-[900px] w-full bg-gradient-to-br from-[rgba(12,16,40,0.98)] to-[rgba(9,9,26,0.94)] rounded-[20px] border border-[rgba(255,255,255,0.12)] shadow-[0_22px_55px_rgba(0,0,0,0.8)] backdrop-blur-[20px] relative max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.1)] flex items-center justify-between">
          <div>
            <div className="text-[1.25rem] font-extrabold uppercase tracking-[0.14em] text-[#ffe66d]">
              {formatSportName(selectedSport.name)}
            </div>
          </div>
          <button
            type="button"
            className="bg-transparent border-none text-[#e5e7eb] text-2xl cursor-pointer hover:text-[#ffe66d] transition-colors"
            onClick={handleClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        {availableTabs.length > 0 && (
          <div className="px-6 py-3 border-b border-[rgba(255,255,255,0.1)] flex gap-2">
            {availableTabs.map((tab) => {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-[0.85rem] font-bold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-[rgba(255,230,109,0.2)] text-[#ffe66d] border border-[rgba(255,230,109,0.3)]'
                      : 'bg-[rgba(255,255,255,0.05)] text-[#cbd5ff] hover:bg-[rgba(255,255,255,0.1)] border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tabContent}
        </div>
      </div>
    </div>
  )
}

export default SportDetailsModal

