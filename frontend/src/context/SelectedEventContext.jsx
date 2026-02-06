import { createContext, useContext } from 'react'

const SelectedEventContext = createContext({ selectedEventId: null })

export function SelectedEventProvider({ selectedEventId, children }) {
  return (
    <SelectedEventContext.Provider value={{ selectedEventId }}>
      {children}
    </SelectedEventContext.Provider>
  )
}

export function useSelectedEvent() {
  return useContext(SelectedEventContext)
}
