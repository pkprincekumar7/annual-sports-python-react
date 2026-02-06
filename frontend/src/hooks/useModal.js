/**
 * useModal Hook
 * Reusable hook for modal state management
 */

import { useState, useCallback } from 'react'

/**
 * Custom hook for modal state management
 */
export const useModal = (initialState = false) => {
  const [isOpen, setIsOpen] = useState(initialState)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    isOpen,
    open,
    close,
    toggle,
  }
}

