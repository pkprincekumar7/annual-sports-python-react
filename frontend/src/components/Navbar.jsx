import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventYear } from '../hooks/useEventYear'
import { isWithinRegistrationPeriod } from '../utils/yearHelpers'
import ProfileModal from './ProfileModal'

function Navbar({
  loggedInUser,
  selectedEventId,
  onLoginClick,
  onRegisterClick,
  onResetPasswordClick,
  onLogout,
  onChangePasswordClick,
  onCaptainManagementClick,
  onCoordinatorManagementClick,
  onBatchManagementClick,
  onListPlayersClick,
  onExportExcel,
  onAdminDashboardClick
}) {
  const { eventYearConfig } = useEventYear()
  const eventTitle = eventYearConfig?.event_title || 'Community Entertainment'
  const eventYear = eventYearConfig?.event_year
  const isRegistrationPeriodActive = eventYearConfig?.registration_dates
    ? isWithinRegistrationPeriod(eventYearConfig.registration_dates)
    : false
  const isAdmin = loggedInUser?.reg_number === 'admin'
  const isCoordinator = Array.isArray(loggedInUser?.coordinator_in) && loggedInUser.coordinator_in.length > 0
  const canManageCaptains = isAdmin || isCoordinator
  const canListPlayers = isAdmin || isCoordinator
  const hasMenuActions = !!loggedInUser || !!onLoginClick || !!onRegisterClick || !!onResetPasswordClick
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 0 })
  const menuButtonRef = useRef(null)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  const handleNavClick = (e, targetId) => {
    e.preventDefault()
    if (targetId === 'home') {
      // Scroll to the very top of the page
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      // For other sections, scroll to the element
      const element = document.getElementById(targetId)
      if (element) {
        const navHeight = 80 // Approximate navbar height
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset
        const offsetPosition = elementPosition - navHeight

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        })
      }
    }
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isMenuOpen])

  return (
    <nav className="bg-[rgba(5,7,22,0.96)] backdrop-blur-[20px] py-[0.9rem] sticky top-0 z-[100] shadow-[0_10px_25px_rgba(0,0,0,0.6)]">
      <div className="max-w-[1300px] mx-auto px-4 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-[0.6rem]">
          <img src="/images/logo.png" alt="PCE Logo" className="h-10 w-auto object-contain" />
          <div className="text-[1.1rem] max-md:text-[0.9rem] font-extrabold tracking-[0.16em] uppercase text-white">
            <span className="text-[#ffe66d]">{eventTitle}</span>{eventYear ? ` - ${eventYear}` : ''}
          </div>
        </div>

        <ul className="flex items-center gap-[1.6rem] list-none text-[0.85rem] uppercase tracking-[0.08em] max-md:w-full max-md:justify-between max-md:mt-1 max-md:gap-0 max-md:text-[0.78rem]">
          {hasMenuActions && (
            <li>
              <button
                type="button"
                aria-label="Menu"
                ref={menuButtonRef}
                onClick={() => {
                  if (menuButtonRef.current) {
                    const rect = menuButtonRef.current.getBoundingClientRect()
                    const menuWidth = 224
                    const top = rect.bottom + 8
                    const maxHeight = Math.max(180, window.innerHeight - top - 12)
                    const left = Math.min(
                      Math.max(12, rect.left),
                      window.innerWidth - menuWidth - 12
                    )
                    setMenuPosition({ top, left, maxHeight })
                  }
                  setIsMenuOpen(!isMenuOpen)
                }}
                className="h-9 w-9 rounded-full border border-[rgba(148,163,184,0.7)] bg-[rgba(15,23,42,0.95)] text-[#e5e7eb] shadow-[0_8px_18px_rgba(0,0,0,0.5)] grid place-items-center"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="block h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {isMenuOpen && typeof document !== 'undefined' && createPortal(
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <div
                    className="fixed w-56 rounded-lg bg-[rgba(15,23,42,0.98)] border border-[rgba(148,163,184,0.5)] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-y-auto"
                    style={{
                      top: `${menuPosition.top}px`,
                      left: `${menuPosition.left}px`,
                      maxHeight: `${menuPosition.maxHeight}px`
                    }}
                  >
                    <div className="py-2">
                      {loggedInUser ? (
                        <>
                          <button
                            onClick={() => {
                              setIsMenuOpen(false)
                              setIsProfileModalOpen(true)
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                          >
                            <span className="text-[#ffe66d]">●</span> Profile
                          </button>
                          {canManageCaptains && onCaptainManagementClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onCaptainManagementClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#6366f1]">●</span> Add/Remove Captain
                            </button>
                          )}
                          {loggedInUser?.reg_number === 'admin' && onCoordinatorManagementClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onCoordinatorManagementClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#10b981]">●</span> Add/Remove Coordinator
                            </button>
                          )}
                          {loggedInUser?.reg_number === 'admin' && onBatchManagementClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onBatchManagementClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#f59e0b]">●</span> Add/Remove Batch
                            </button>
                          )}
                          {canListPlayers && onListPlayersClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onListPlayersClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#059669]">●</span> List Players
                            </button>
                          )}
                          {loggedInUser?.reg_number === 'admin' && onExportExcel && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onExportExcel()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#3b82f6]">●</span> Export Excel
                            </button>
                          )}
                          {loggedInUser?.reg_number === 'admin' && onAdminDashboardClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onAdminDashboardClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#f59e0b]">●</span> Admin Dashboard
                            </button>
                          )}
                          {(onChangePasswordClick || onLogout) && (
                            <div className="border-t border-[rgba(148,163,184,0.3)] mt-2 pt-2">
                              {onChangePasswordClick && (
                                <button
                                  onClick={() => {
                                    setIsMenuOpen(false)
                                    onChangePasswordClick()
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                                >
                                  <span className="text-[#8b5cf6]">●</span> Change Password
                                </button>
                              )}
                              {onLogout && (
                                <button
                                  onClick={() => {
                                    setIsMenuOpen(false)
                                    onLogout()
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                                >
                                  <span className="text-red-400">●</span> Logout
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {onLoginClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onLoginClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#ffe66d]">●</span> Login
                            </button>
                          )}
                          {onRegisterClick && isRegistrationPeriodActive && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onRegisterClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#f59e0b]">●</span> Register
                            </button>
                          )}
                          {onResetPasswordClick && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                onResetPasswordClick()
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)] transition-colors flex items-center gap-2"
                            >
                              <span className="text-[#8b5cf6]">●</span> Reset Password
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>,
                document.body
              )}
            </li>
          )}
          <li>
            <a 
              href="#home" 
              onClick={(e) => handleNavClick(e, 'home')}
              className="text-[#e2e8f0] no-underline relative pb-[3px] hover:text-[#ffe66d] after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-0 after:h-0.5 after:bg-gradient-to-r after:from-[#ffe66d] after:to-[#ff4d4d] after:transition-all after:duration-[0.25s] after:ease-in-out hover:after:w-full cursor-pointer"
            >
              Home
            </a>
          </li>
          <li>
            <a 
              href="#about" 
              onClick={(e) => handleNavClick(e, 'about')}
              className="text-[#e2e8f0] no-underline relative pb-[3px] hover:text-[#ffe66d] after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-0 after:h-0.5 after:bg-gradient-to-r after:from-[#ffe66d] after:to-[#ff4d4d] after:transition-all after:duration-[0.25s] after:ease-in-out hover:after:w-full cursor-pointer"
            >
              About
            </a>
          </li>
          <li>
            <a 
              href="#contact" 
              onClick={(e) => handleNavClick(e, 'contact')}
              className="text-[#e2e8f0] no-underline relative pb-[3px] hover:text-[#ffe66d] after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-0 after:h-0.5 after:bg-gradient-to-r after:from-[#ffe66d] after:to-[#ff4d4d] after:transition-all after:duration-[0.25s] after:ease-in-out hover:after:w-full cursor-pointer"
            >
              Contact
            </a>
          </li>
          <li>
            <div className="flex items-center bg-[#e5e7eb]">
              <img src="/images/State.png" alt="State Logo" className="h-10 w-auto object-contain" />
            </div>
          </li>
        </ul>
      </div>
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        loggedInUser={loggedInUser}
        selectedEventId={selectedEventId}
      />
    </nav>
  )
}

export default Navbar

