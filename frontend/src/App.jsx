import { useState, useEffect, useRef } from 'react'
import { fetchWithAuth, fetchCurrentUser, decodeJWT, clearCache } from './utils/api'
import { buildApiUrlWithYear } from './utils/apiHelpers'
import logger from './utils/logger'
import { useEventYear } from './hooks/useEventYear'
import { resetEventYearsCache } from './hooks/useEventYears'
import { formatDateRange } from './utils/dateFormatters'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import SportsSection from './components/SportsSection'
import RegisterModal from './components/RegisterModal'
import LoginModal from './components/LoginModal'
import ChangePasswordModal from './components/ChangePasswordModal'
import ResetPasswordModal from './components/ResetPasswordModal'
import CaptainManagementModal from './components/CaptainManagementModal'
import CoordinatorManagementModal from './components/CoordinatorManagementModal'
import BatchManagementModal from './components/BatchManagementModal'
import TeamDetailsModal from './components/TeamDetailsModal'
import ParticipantDetailsModal from './components/ParticipantDetailsModal'
import PlayerListModal from './components/PlayerListModal'
import EventScheduleModal from './components/EventScheduleModal'
import SportDetailsModal from './components/SportDetailsModal'
import AdminDashboardModal from './components/AdminDashboardModal'
import AboutSection from './components/AboutSection'
import Footer from './components/Footer'
import StatusPopup from './components/StatusPopup'
import ErrorBoundary from './components/ErrorBoundary'
import { SelectedEventProvider } from './context/SelectedEventContext'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)
  const [isCaptainManagementModalOpen, setIsCaptainManagementModalOpen] = useState(false)
  const [isCoordinatorManagementModalOpen, setIsCoordinatorManagementModalOpen] = useState(false)
  const [isBatchManagementModalOpen, setIsBatchManagementModalOpen] = useState(false)
  const [isTeamDetailsModalOpen, setIsTeamDetailsModalOpen] = useState(false)
  const [isParticipantDetailsModalOpen, setIsParticipantDetailsModalOpen] = useState(false)
  const [isPlayerListModalOpen, setIsPlayerListModalOpen] = useState(false)
  const [isEventScheduleModalOpen, setIsEventScheduleModalOpen] = useState(false)
  const [isSportDetailsModalOpen, setIsSportDetailsModalOpen] = useState(false)
  const [isAdminDashboardModalOpen, setIsAdminDashboardModalOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState(null) // Admin can select an event to view (event_id)
  const [selectedSport, setSelectedSport] = useState(null)
  const [selectedEventSport, setSelectedEventSport] = useState(null)
  const [statusPopup, setStatusPopup] = useState({ show: false, message: '', type: 'success' })
  const loginSuccessRef = useRef(false) // Track if login was successful to preserve selectedSport
  
  // Only store JWT token in localStorage, not user data
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('authToken') || null
  })
  const [loggedInUser, setLoggedInUser] = useState(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  
  // Fetch active event year for dynamic event name display
  const { eventYear, eventYearConfig, loading: eventYearLoading } = useEventYear(selectedEventId)
  const eventDisplayName = eventYearConfig 
    ? `${eventYearConfig.event_name} - ${eventYearConfig.event_year}`
    : 'Championship' // Fallback to default value if no active event year
  const eventOrganizer = eventYearConfig?.event_organizer || 'Events Community'

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
        }
        return
      }

      // Ensure authToken state is set from localStorage
      if (isMounted) {
        setAuthToken(token)
      }

      // Store token before fetch to check if it gets cleared
      const tokenBeforeFetch = token

      try {
        // Use optimized fetchCurrentUser function (uses cache)
        const result = await fetchCurrentUser()
        
        if (!isMounted) return

        // Check if token was cleared during fetch (indicates auth error)
        const tokenAfterFetch = localStorage.getItem('authToken')
        const tokenWasCleared = tokenBeforeFetch && !tokenAfterFetch

        if (result.user) {
          // Successfully fetched user data
          setLoggedInUser(result.user)
          setAuthToken(tokenBeforeFetch) // Ensure authToken state is set
          setIsLoadingUser(false) // Stop loading
          // Ensure token is set (in case it was temporarily missing)
          if (tokenBeforeFetch && !tokenAfterFetch) {
            localStorage.setItem('authToken', tokenBeforeFetch)
          }
        } else if (result.authError || tokenWasCleared) {
          // Authentication error - but be VERY conservative on rapid refresh
          // If token exists in localStorage, don't clear it immediately
          // This prevents false logouts on rapid page refreshes
          const currentToken = localStorage.getItem('authToken')
          
          if (tokenWasCleared && !currentToken) {
            // Token was actually cleared - this is a real auth error
            logger.info('Authentication error detected, token was cleared')
            setAuthToken(null)
            setLoggedInUser(null)
            setIsLoadingUser(false)
          } else if (result.authError && currentToken) {
            // We got an auth error, but token still exists
            // On rapid refresh, this might be a false positive
            // Don't clear the token or user state - just stop loading
            // The user stays logged in with the token
            logger.warn('Auth error but token exists - preserving login state (might be false positive on rapid refresh)')
            setIsLoadingUser(false)
            // Keep the user logged in - don't clear state
            // If the token is really invalid, it will fail on the next real API call
          } else if (result.authError && !currentToken) {
            // Auth error and no token - clear state
            logger.info('Authentication error detected, no token found')
            setAuthToken(null)
            setLoggedInUser(null)
            setIsLoadingUser(false)
          } else {
            setIsLoadingUser(false)
          }
        } else {
          // If result.user is null but authError is false and token wasn't cleared,
          // it means a temporary error (network issue, server error, etc.)
          logger.warn('Temporary error fetching user data. Result:', result)
          
          // Ensure authToken state is set since token exists
          setAuthToken(tokenBeforeFetch)
          
          // Retry immediately without delay for better UX
          // Keep loading true until retry completes
          const retryFetch = async () => {
            if (!isMounted) return
            try {
              const retryResult = await fetchCurrentUser()
              if (!isMounted) return
              
              if (retryResult.user) {
                setLoggedInUser(retryResult.user)
                setAuthToken(localStorage.getItem('authToken'))
                setIsLoadingUser(false) // Stop loading on success
              } else if (retryResult.authError) {
                // Auth error on retry - clear token
                logger.info('Authentication error on retry, clearing token')
                localStorage.removeItem('authToken')
                setAuthToken(null)
                setLoggedInUser(null)
                setIsLoadingUser(false) // Stop loading on auth error
              } else {
                // Retry also failed with temporary error - stop loading but keep token
                setIsLoadingUser(false)
              }
            } catch (retryError) {
              if (!isMounted) return
              logger.error('Error on retry fetch:', retryError)
              setIsLoadingUser(false) // Stop loading even on error
              // Keep token - might be temporary network issue
            }
          }
          
          // Retry immediately (no delay) - use setTimeout with 0 to run after current execution
          setTimeout(retryFetch, 0)
          // Don't set loading to false here - let retry handle it
        }
      } catch (error) {
        if (!isMounted) return
        logger.error('Error fetching user data:', error)
        // On unexpected errors, check if token still exists
        // Only clear if it was explicitly cleared (auth error)
        const currentToken = localStorage.getItem('authToken')
        if (!currentToken && tokenBeforeFetch) {
          // Token was cleared during fetch, likely an auth error
          setAuthToken(null)
          setLoggedInUser(null)
          setIsLoadingUser(false)
        } else {
          // Token still exists - might be temporary network issue
          // Retry once
          const retryFetch = async () => {
            if (!isMounted) return
            try {
              const retryResult = await fetchCurrentUser()
              if (!isMounted) return
              
              if (retryResult.user) {
                setLoggedInUser(retryResult.user)
                setAuthToken(localStorage.getItem('authToken'))
                setIsLoadingUser(false)
              } else if (retryResult.authError) {
                localStorage.removeItem('authToken')
                setAuthToken(null)
                setLoggedInUser(null)
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
          // Don't set loading to false here - let retry handle it
        }
      }
    }

    fetchUserData()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [])

  // Reset event years cache when user logs in (authToken changes from null to a value)
  const prevAuthTokenRef = useRef(authToken)
  useEffect(() => {
    // Only reset if authToken changed from null/undefined to a value (user logged in)
    // Don't reset on every authToken change to avoid infinite loops
    if (authToken && !prevAuthTokenRef.current) {
      resetEventYearsCache()
    }
    prevAuthTokenRef.current = authToken
  }, [authToken])

  const handleEventScheduleClick = (sport) => {
    // Determine sport_type: check if it's a cultural event
    const culturalSports = [
      'Essay Writing', 'Story Writing', 'Group Discussion', 'Debate',
      'Extempore', 'Quiz', 'Dumb Charades', 'Painting', 'Singing'
    ]
    const isCultural = culturalSports.includes(sport.name)
    
    setSelectedEventSport({
      ...sport,
      sportType: sport.type === 'team' ? 'team' : (isCultural ? 'cultural' : 'individual')
    })
    setIsEventScheduleModalOpen(true)
  }

  const handleSportClick = (sport) => {
    // Prevent actions while user data is loading
    if (isLoadingUser) {
      return
    }

    // If user is not logged in, open login modal and store the selected sport
    if (!loggedInUser) {
      setSelectedSport(sport)
      setIsLoginModalOpen(true)
      return
    }
    
    // For logged-in users, open the unified sport details modal
    setSelectedSport(sport)
    setIsSportDetailsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedSport(null)
  }

  const handleCloseLoginModal = () => {
    setIsLoginModalOpen(false)
    // Clear selected sport when login modal is closed
    setSelectedSport(null)
    loginSuccessRef.current = false // Reset the flag
  }

  const handleLoginSuccess = (player, token, changePasswordRequired = false) => {
    // Store player data in memory only (excluding password)
    // Do NOT store in localStorage - only token is stored
    setLoggedInUser(player)
    // Store JWT token in localStorage
    if (token) {
      setAuthToken(token)
      localStorage.setItem('authToken', token)
    }
    // Set flag to indicate login was successful
    loginSuccessRef.current = true
    // Close login modal - user can click on sport again if they want to view it
    setIsLoginModalOpen(false)
    // Clear selected sport - let user choose what to do after login
    setSelectedSport(null)
    
    // Dispatch event to notify hooks that user has logged in
    // This allows useEventYear hook to refetch and use latest event year if no active event year
    window.dispatchEvent(new Event('userLoggedIn'))
    
    // If password change is required, show change password modal
    if (changePasswordRequired) {
      setTimeout(() => {
        setIsChangePasswordModalOpen(true)
      }, 300)
    }
  }

  // Function to refresh user data from server (optimized with cache)
  const refreshUserData = async () => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoggedInUser(null)
      return
    }

    try {
      // Clear cache to force fresh fetch
      clearCache('/identities/players')
      // Use optimized fetchCurrentUser function
      const result = await fetchCurrentUser()
      if (result.user) {
        setLoggedInUser(result.user)
      } else if (result.authError) {
        // Auth error - clear user and token
        setLoggedInUser(null)
        localStorage.removeItem('authToken')
        setAuthToken(null)
      } else {
        // Temporary error - keep current user state, don't clear
        // User stays logged in with cached data
      }
    } catch (error) {
      logger.error('Error refreshing user data:', error)
      // On unexpected errors, don't clear user - might be temporary network issue
    }
  }

  const handleUserUpdate = (updatedPlayer) => {
    // Update logged-in user data (e.g., after participation update)
    setLoggedInUser(updatedPlayer)
    // Clear cache to ensure fresh data on next fetch
    clearCache('/identities/players')
  }

  const handleLogout = () => {
    // Clear logged-in user data from memory and token from localStorage
    setLoggedInUser(null)
    setAuthToken(null)
    localStorage.removeItem('authToken')
    showStatusPopup('✅ Logged out successfully!', 'success', 2000)
  }

  const showStatusPopup = (message, type = 'success', duration = 2500) => {
    setStatusPopup({ show: true, message, type })
    setTimeout(() => {
      setStatusPopup({ show: false, message: '', type: 'success' })
    }, duration)
  }

  const handleExportExcel = async () => {
    try {
      // Wait for event year list to load if selection isn't available yet
      if (eventYearLoading && !selectedEventId) {
        showStatusPopup('⏳ Please wait while event year is being loaded...', 'info', 2000)
        return
      }

      // Always use the selected event_id; if none is selected, export with empty event data
      const eventId = selectedEventId || null
      
      const exportUrl = buildApiUrlWithYear('/reportings/export-excel', eventId)
      const response = await fetchWithAuth(exportUrl)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        showStatusPopup(
          `❌ ${errorData.error || 'Failed to export Excel file. Please try again.'}`,
          'error',
          3000
        )
        return
      }

      // Get the blob from response
      const blob = await response.blob()
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'Players_Report.xlsx'
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }
      
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      showStatusPopup('✅ Excel file downloaded successfully!', 'success', 2500)
    } catch (err) {
      logger.error('Error exporting Excel:', err)
      showStatusPopup('❌ Error exporting Excel file. Please try again.', 'error', 3000)
    }
  }

  return (
    <SelectedEventProvider selectedEventId={selectedEventId}>
      <ErrorBoundary>
        <Navbar
          loggedInUser={loggedInUser}
          selectedEventId={selectedEventId}
          onRegisterClick={() => setIsModalOpen(true)}
          onLoginClick={() => setIsLoginModalOpen(true)}
          onResetPasswordClick={() => setIsResetPasswordModalOpen(true)}
          onLogout={handleLogout}
          onChangePasswordClick={() => setIsChangePasswordModalOpen(true)}
          onCaptainManagementClick={() => setIsCaptainManagementModalOpen(true)}
          onCoordinatorManagementClick={() => setIsCoordinatorManagementModalOpen(true)}
          onBatchManagementClick={() => setIsBatchManagementModalOpen(true)}
          onListPlayersClick={() => setIsPlayerListModalOpen(true)}
          onExportExcel={handleExportExcel}
          onAdminDashboardClick={() => setIsAdminDashboardModalOpen(true)}
        />
        <main id="top" className="max-w-[1300px] mx-auto px-4 py-6 pb-10 grid grid-cols-[minmax(0,1.6fr)] gap-10 max-md:grid-cols-1">
        <section>
          {isLoadingUser ? (
            // Show loading state while fetching user data
            <div id="home" className="mb-6 text-center">
              <div
                className="mx-auto px-[1.4rem] py-[1.8rem] pb-8 rounded-[20px] relative overflow-hidden bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.75)), url("/images/collge.png")',
                }}
              >
                <div className="text-center text-[1.7rem] font-semibold text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.7)]">
                  {eventOrganizer}
                </div>
                <div
                  className="mt-[1.2rem] mb-[0.6rem] mx-auto text-center w-fit px-[1.6rem] py-2 bg-gradient-to-b from-[#ff3434] to-[#b70000] rounded-full shadow-[0_14px_30px_rgba(0,0,0,0.6),0_0_0_3px_rgba(255,255,255,0.15)] relative overflow-visible"
                  style={{
                    position: 'relative',
                  }}
                >
                  <div
                    className="absolute top-1/2 left-[-26px] w-[42px] h-[26px] bg-gradient-to-b from-[#c40d0d] to-[#7a0202]"
                    style={{
                      clipPath: 'polygon(100% 0, 0 0, 80% 50%, 0 100%, 100% 100%)',
                    }}
                  />
                  <div
                    className="absolute top-1/2 right-[-26px] w-[42px] h-[26px] bg-gradient-to-b from-[#c40d0d] to-[#7a0202]"
                    style={{
                      clipPath: 'polygon(0 0, 100% 0, 20% 50%, 100% 100%, 0 100%)',
                    }}
                  />
                  <div className="text-[2.2rem] font-bold tracking-[0.18em] text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.7),0_0_12px_rgba(0,0,0,0.8)] max-md:text-[1.7rem]">
                    {eventDisplayName}
                  </div>
                </div>
                <div className="mt-4 mb-2 text-center">
                  <div className="text-[1.2rem] font-bold text-[#ffe66d] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] animate-pulse">
                    Loading user data...
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Hero 
                eventDisplayName={eventDisplayName}
                onRegisterClick={() => setIsModalOpen(true)} 
                onLoginClick={() => setIsLoginModalOpen(true)}
                onLogout={handleLogout}
                onCaptainManagementClick={() => setIsCaptainManagementModalOpen(true)}
                onCoordinatorManagementClick={() => setIsCoordinatorManagementModalOpen(true)}
                onBatchManagementClick={() => setIsBatchManagementModalOpen(true)}
                onListPlayersClick={() => setIsPlayerListModalOpen(true)}
                onExportExcel={handleExportExcel}
                onAdminDashboardClick={() => setIsAdminDashboardModalOpen(true)}
                onChangePasswordClick={() => setIsChangePasswordModalOpen(true)}
                onResetPasswordClick={() => setIsResetPasswordModalOpen(true)}
                onEventYearChange={(eventId) => {
                  setSelectedEventId(eventId)
                  // Clear caches when event year changes
                  clearCache('/sports-participations/sports')
                  clearCache('/sports-participations/sports-counts')
                  clearCache('/schedulings/event-schedule')
                }}
                selectedEventId={selectedEventId}
                loggedInUser={loggedInUser}
              />
              <SportsSection 
                onSportClick={handleSportClick} 
                onEventScheduleClick={handleEventScheduleClick}
                loggedInUser={loggedInUser} 
                selectedEventId={selectedEventId}
              />
            </>
          )}
        </section>
      </main>
      <RegisterModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        selectedSport={selectedSport}
        onStatusPopup={showStatusPopup}
        loggedInUser={loggedInUser}
        onUserUpdate={handleUserUpdate}
        selectedEventId={selectedEventId}
      />
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={handleCloseLoginModal}
        onLoginSuccess={handleLoginSuccess}
        onStatusPopup={showStatusPopup}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onStatusPopup={showStatusPopup}
        onPasswordChanged={async () => {
          // Refresh user data after password change
          await refreshUserData()
        }}
      />
      <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        onStatusPopup={showStatusPopup}
      />
      <CaptainManagementModal
        isOpen={isCaptainManagementModalOpen}
        onClose={() => setIsCaptainManagementModalOpen(false)}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
        loggedInUser={loggedInUser}
      />
      <CoordinatorManagementModal
        isOpen={isCoordinatorManagementModalOpen}
        onClose={() => setIsCoordinatorManagementModalOpen(false)}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <BatchManagementModal
        isOpen={isBatchManagementModalOpen}
        onClose={() => setIsBatchManagementModalOpen(false)}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <TeamDetailsModal
        isOpen={isTeamDetailsModalOpen}
        onClose={() => {
          setIsTeamDetailsModalOpen(false)
          setSelectedSport(null)
        }}
        sport={selectedSport?.name}
        sportDetails={selectedSport}
        loggedInUser={loggedInUser}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <ParticipantDetailsModal
        isOpen={isParticipantDetailsModalOpen}
        onClose={() => {
          setIsParticipantDetailsModalOpen(false)
          setSelectedSport(null)
        }}
        sport={selectedSport?.name}
        sportDetails={selectedSport}
        loggedInUser={loggedInUser}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <PlayerListModal
        isOpen={isPlayerListModalOpen}
        onClose={() => setIsPlayerListModalOpen(false)}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <EventScheduleModal
        isOpen={isEventScheduleModalOpen}
        onClose={() => {
          setIsEventScheduleModalOpen(false)
          setSelectedEventSport(null)
        }}
        sport={selectedEventSport?.name}
        sportType={selectedEventSport?.sportType || (selectedEventSport?.type === 'team' ? 'team' : 'individual')}
        sportDetails={selectedEventSport}
        loggedInUser={loggedInUser}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
      />
      <SportDetailsModal
        isOpen={isSportDetailsModalOpen}
        onClose={() => {
          setIsSportDetailsModalOpen(false)
          setSelectedSport(null)
        }}
        selectedSport={selectedSport}
        loggedInUser={loggedInUser}
        onStatusPopup={showStatusPopup}
        onUserUpdate={handleUserUpdate}
        onEventScheduleClick={handleEventScheduleClick}
        selectedEventId={selectedEventId}
      />
      <AdminDashboardModal
        isOpen={isAdminDashboardModalOpen}
        onClose={() => setIsAdminDashboardModalOpen(false)}
        onStatusPopup={showStatusPopup}
        selectedEventId={selectedEventId}
        onEventYearChange={(eventId) => {
          setSelectedEventId(eventId)
          // Clear caches when event year changes
          clearCache('/sports-participations/sports')
          clearCache('/sports-participations/sports-counts')
          clearCache('/schedulings/event-schedule')
        }}
        loggedInUser={loggedInUser}
      />
      <AboutSection />
      <Footer />
        <StatusPopup popup={statusPopup} />
      </ErrorBoundary>
    </SelectedEventProvider>
  )
}

export default App

