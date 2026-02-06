/**
 * Event Year Selector Component
 * Allows authenticated users to switch between event years for viewing
 */

import { useEffect, useRef, useState } from 'react'
import { useEventYear, useEventYears } from '../hooks'

function EventYearSelector({ selectedEventId, onEventYearChange, loggedInUser }) {
  const { eventYears, loading } = useEventYears()
  const { eventYearConfig } = useEventYear()
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)

  // Only show for authenticated users
  if (!loggedInUser) {
    return null
  }

  const handleEventYearChange = (eventId) => {
    const selectedEventIdValue = eventId ? String(eventId) : null
    if (onEventYearChange) {
      onEventYearChange(selectedEventIdValue)
    }
  }

  const activeEventYearData = eventYears.find(y => y.is_active)
  const activeEventId = activeEventYearData?.event_id || eventYearConfig?.event_id || null
  const currentEventId = selectedEventId || activeEventId
  const currentEventData = currentEventId
    ? eventYears.find(ey => ey.event_id === currentEventId)
    : null

  // Auto-select active event year on initial load if not already selected
  // Use a ref to track if we've already auto-selected to prevent infinite loops
  const hasAutoSelectedRef = useRef(false)
  useEffect(() => {
    if (eventYears.length > 0 && !selectedEventId && activeEventYearData && onEventYearChange && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true
      onEventYearChange(activeEventYearData.event_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventYears.length, activeEventYearData?.event_id, selectedEventId])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const currentLabel = currentEventData
    ? `${currentEventData.event_year} - ${currentEventData.event_name}${currentEventData.is_active ? ' (Active)' : ''}`
    : 'Select event year'

  return (
    <div ref={wrapperRef} className="relative flex items-center justify-end">
      <button
        type="button"
        onClick={() => !loading && setIsOpen((prev) => !prev)}
        className="w-40 px-3 py-1.5 rounded-lg border border-[rgba(148,163,184,0.6)] bg-[rgba(15,23,42,0.9)] text-[#e2e8f0] text-sm outline-none transition-all duration-[0.15s] ease-in-out focus:border-[#ffe66d] focus:shadow-[0_0_0_1px_rgba(255,230,109,0.55),0_0_16px_rgba(248,250,252,0.2)] flex items-start justify-between gap-3"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={loading}
      >
        <span className="text-left truncate">{loading ? 'Loading...' : currentLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-40 rounded-lg bg-[rgba(15,23,42,0.98)] border border-[rgba(148,163,184,0.5)] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-20 overflow-y-auto"
          style={{ maxHeight: '260px' }}
          role="listbox"
        >
          {eventYears.map((eventYear) => {
            const isSelected = eventYear.event_id === currentEventId
            return (
              <button
                key={eventYear._id}
                type="button"
                onClick={() => {
                  handleEventYearChange(eventYear.event_id)
                  setIsOpen(false)
                }}
                className={`w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors leading-snug whitespace-normal break-words ${
                  isSelected
                    ? 'bg-[rgba(148,163,184,0.2)] text-[#ffe66d]'
                    : 'text-[#e5e7eb] hover:bg-[rgba(148,163,184,0.2)]'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                {eventYear.event_year} - {eventYear.event_name} {eventYear.is_active ? '(Active)' : ''}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default EventYearSelector
