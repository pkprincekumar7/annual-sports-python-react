import { useEffect, useState } from 'react'
import { useEventYear } from '../hooks/useEventYear'
import { formatDateRange } from '../utils/dateFormatters'
import { isWithinRegistrationPeriod } from '../utils/yearHelpers'
import EventYearSelector from './EventYearSelector'

function Hero({ eventDisplayName, onRegisterClick, onLoginClick, onLogout, onCaptainManagementClick, onCoordinatorManagementClick, onBatchManagementClick, onListPlayersClick, onExportExcel, onAdminDashboardClick, onEventYearChange, selectedEventId, loggedInUser, onChangePasswordClick, onResetPasswordClick }) {
  const { eventYearConfig } = useEventYear()
  const eventOrganizer = eventYearConfig?.event_organizer || 'Events Community'
  const [eventCountdown, setEventCountdown] = useState('')

  // Format dates from database
  const eventDateDisplay = eventYearConfig?.event_dates 
    ? formatDateRange(eventYearConfig.event_dates.start, eventYearConfig.event_dates.end)
    : ''
  const registrationDateDisplay = eventYearConfig?.registration_dates
    ? formatDateRange(eventYearConfig.registration_dates.start, eventYearConfig.registration_dates.end)
    : ''
  
  // Check if current date is within registration period
  const isRegistrationPeriodActive = eventYearConfig?.registration_dates
    ? isWithinRegistrationPeriod(eventYearConfig.registration_dates)
    : false
  const hasTopBar = !!loggedInUser

  useEffect(() => {
    // All date fields are required in EventYear model, so they will always be present
    if (!eventYearConfig?.event_dates?.start) {
      setEventCountdown('')
      return
    }

    // Calculate all timestamps once - all dates are required, so no null checks needed
    // API returns ISO date strings with time already included (e.g., "2026-01-02T18:29:59.000Z")
    const registrationStartTime = new Date(eventYearConfig.registration_dates.start).getTime()
    const registrationEndTime = new Date(eventYearConfig.registration_dates.end).getTime()
    const eventStartTime = new Date(eventYearConfig.event_dates.start).getTime()
    const eventEndTime = new Date(eventYearConfig.event_dates.end).getTime()

    const update = () => {
      const currentTime = Date.now()

      // 1. Check if event has ended (MUST be checked first, before any other status)
      if (currentTime > eventEndTime) {
        setEventCountdown('Event has ended!')
        return
      }

      // 2. Check if registration period has ended (but event hasn't ended)
      if (currentTime > registrationEndTime) {
        setEventCountdown('Registration closed!')
        return
      }

      // 3. Check if event has started (but not ended - we already checked event hasn't ended above)
      if (currentTime >= eventStartTime) {
        // Event is in progress (event has started and hasn't ended)
        setEventCountdown('Event in progress!')
        return
      }

      // 4. Before event starts - show countdown to event start
      const diff = eventStartTime - currentTime
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
        const minutes = Math.floor((diff / (1000 * 60)) % 60)
        const seconds = Math.floor((diff / 1000) % 60)

        setEventCountdown(
          `Event starts in: ${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
        )
      } else {
        // Fallback - should not reach here if logic is correct
        setEventCountdown('Event starting soon!')
      }
    }

    update()
    const timer = setInterval(update, 1000)

    return () => clearInterval(timer)
  }, [eventYearConfig?.event_dates?.start, eventYearConfig?.event_dates?.end, eventYearConfig?.registration_dates?.start, eventYearConfig?.registration_dates?.end])

  return (
    <div id="home" className="mb-6 text-center">
      <div
        className={`mx-auto px-[1.4rem] py-[1.8rem] pb-8 rounded-[20px] relative overflow-hidden bg-cover bg-center bg-no-repeat ${hasTopBar ? 'pt-20 sm:pt-20 md:pt-20 lg:pt-[1.8rem]' : ''}`}
        style={{
          backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.75)), url("/images/collge.png")',
        }}
      >
        {hasTopBar && (
          <div className="absolute top-4 right-4 z-10">
            <EventYearSelector
              selectedEventId={selectedEventId}
              onEventYearChange={onEventYearChange}
              loggedInUser={loggedInUser}
            />
          </div>
        )}
        <div className="text-center text-[1.7rem] max-md:text-[1.2rem] font-semibold text-white drop-shadow-[0_0_8px_rgba(0,0,0,0.7)]">
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
          <div className="text-[2.2rem] font-bold tracking-[0.18em] text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.7),0_0_12px_rgba(0,0,0,0.8)] max-md:text-[1.3rem]">
            {eventDisplayName || 'Championship'}
          </div>
        </div>
        {eventDateDisplay && (
          <div className="mt-1 text-center text-[1.2rem] font-bold text-[#ffe66d] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] max-md:text-base">
            Event Date: {eventDateDisplay}
          </div>
        )}
        {registrationDateDisplay && (
          <div className="mt-[0.7rem] text-center text-[1.2rem] font-semibold text-[#ff4dff] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]">
            Registration Date: {registrationDateDisplay}
          </div>
        )}
        {eventCountdown && (
          <div id="eventCountdown" className="mt-2 mb-0 text-center text-base font-semibold text-red-500">
            {eventCountdown}
          </div>
        )}
        {loggedInUser ? (
          <div className="mt-6 mb-2 text-center flex flex-col gap-3 items-center">
            <div className="text-[1.2rem] font-bold text-[#ffe66d] drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]">
              Welcome {loggedInUser.full_name}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-[1.4rem] mx-auto max-w-[1000px] text-center px-4 py-2 rounded-full bg-gradient-to-r from-[rgba(0,0,0,0.7)] to-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] font-bold tracking-[0.08em] uppercase text-[1.5rem]">
        MULTIPLE SPORTS • <span className="text-[#ffe66d]">TROPHIES &amp; PRIZES</span> • JOIN THE GAME
      </div>
      
    </div>
  )
}

export default Hero

