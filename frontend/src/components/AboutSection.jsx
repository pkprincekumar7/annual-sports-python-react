import { useEventYear } from '../hooks/useEventYear'

function AboutSection() {
  const { eventYearConfig } = useEventYear()
  const eventDisplayName = eventYearConfig 
    ? `${eventYearConfig.event_name} - ${eventYearConfig.event_year}`
    : 'Championship' // Fallback to default value if no active year
  const eventOrganizer = eventYearConfig?.event_organizer || 'Events Community'

  return (
    <section id="about" className="w-full px-6 py-6 pb-[1.8rem] rounded-[18px] bg-[rgba(15,23,42,0.92)] border border-[rgba(148,163,184,0.5)] shadow-[0_16px_40px_rgba(0,0,0,0.7)]">
      <h2 className="text-center text-[1.6rem] tracking-[0.12em] uppercase text-[#ffe66d] mb-4">About The Event</h2>
      <p className="text-[0.95rem] leading-relaxed text-[#e5e7eb] mb-[0.7rem]">
        Welcome to the official registration portal for {eventDisplayName}, the annual sports extravaganza of {eventOrganizer}. Get ready to showcase your talent, sportsmanship, and team spirit!
      </p>
      <p className="text-[0.95rem] leading-relaxed text-[#e5e7eb] mb-[0.7rem]">
        Players are encouraged to participate in multiple sports events. Whether you are an athlete or a team
        player, there is something for everyone.
      </p>
      <p className="text-[0.95rem] text-[#fed7aa] mt-[0.8rem]">
        <strong>Note:</strong> Registration is mandatory for all participants.
      </p>
    </section>
  )
}

export default AboutSection

