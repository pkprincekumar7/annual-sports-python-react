import { useEventYear } from '../hooks/useEventYear'

function Footer() {
  const { eventYearConfig } = useEventYear()
  const eventOrganizer = eventYearConfig?.event_organizer || 'Events Community'

  return (
    <footer id="contact" className="text-center px-4 py-6 pb-8 text-[#9ca3af] text-[0.85rem]">
      For queries, contact <span className="text-[#ffe66d]">Sports Council, {eventOrganizer}</span>.
    </footer>
  )
}

export default Footer

