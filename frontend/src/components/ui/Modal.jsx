/**
 * Reusable Modal Component
 * Eliminates code duplication across all modals
 */

import { createPortal } from 'react-dom'
import { useEventYear } from '../../hooks/useEventYear'

function Modal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle,
  headerLabel = null,
  children, 
  embedded = false,
  maxWidth = 'max-w-[700px]',
  showCloseButton = true,
  className = '',
}) {
  const { eventYearConfig } = useEventYear()
  const eventHighlight = eventYearConfig?.event_highlight || 'Community Entertainment Fest'
  const displaySubtitle = subtitle !== undefined ? subtitle : eventHighlight
  if (!isOpen) return null

  const modalContent = (
    <aside 
      className={`
        ${embedded ? 'w-full' : `${maxWidth} w-full`} 
        bg-gradient-to-br from-[rgba(12,16,40,0.98)] to-[rgba(9,9,26,0.94)] 
        rounded-[20px] 
        ${embedded ? 'px-0 py-0' : 'px-[1.4rem] py-[1.6rem] pb-[1.5rem]'} 
        border border-[rgba(255,255,255,0.12)] 
        ${embedded ? '' : 'shadow-[0_22px_55px_rgba(0,0,0,0.8)]'} 
        backdrop-blur-[20px] 
        relative 
        ${embedded ? '' : 'max-h-[90vh]'} 
        ${embedded ? '' : 'overflow-y-auto'}
        ${embedded ? '' : 'mt-10 sm:mt-14'}
        ${className}
      `}
    >
      {!embedded && showCloseButton && (
        <button
          type="button"
          className="absolute top-[10px] right-3 bg-transparent border-none text-[#e5e7eb] text-base cursor-pointer hover:text-[#ffe66d] transition-colors"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>
      )}

      {headerLabel && (
        <div className="text-[0.78rem] uppercase tracking-[0.16em] text-[#a5b4fc] mb-1 text-center">
          {headerLabel}
        </div>
      )}
      
      {!embedded && title && (
        <div className="text-[1.25rem] font-extrabold text-center uppercase tracking-[0.14em] text-[#ffe66d] mb-[0.7rem]">
          {title}
        </div>
      )}
      
      {displaySubtitle && (
        <div className={`text-[0.85rem] text-center text-[#e5e7eb] mb-4 ${embedded ? (headerLabel ? 'mt-1' : 'mt-[1.25rem]') : ''}`}>
          {displaySubtitle}
        </div>
      )}

      {children}
    </aside>
  )

  if (embedded) {
    return modalContent
  }

  return createPortal(
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.65)] flex items-start justify-center z-[200] p-4 pt-6 pb-6 overflow-y-auto">
      {modalContent}
    </div>,
    document.body
  )
}

export default Modal

