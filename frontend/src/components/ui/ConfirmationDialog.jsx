/**
 * Reusable Confirmation Dialog Component
 * Eliminates duplication of confirmation modals
 */

import Modal from './Modal'
import Button from './Button'

function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  embedded = false,
}) {
  if (!isOpen) return null

  const content = (
    <div className="max-w-[420px] w-full bg-gradient-to-br from-[rgba(12,16,40,0.98)] to-[rgba(9,9,26,0.94)] rounded-[20px] px-[1.4rem] py-[1.6rem] border border-[rgba(255,255,255,0.12)] shadow-[0_22px_55px_rgba(0,0,0,0.8)] backdrop-blur-[20px] relative">
      <div className="text-[0.78rem] uppercase tracking-[0.16em] text-[#a5b4fc] mb-1 text-center">
        Confirm Action
      </div>
      <div className="text-[1.1rem] font-extrabold text-center text-[#ffe66d] mb-4">
        {title}
      </div>
      <div className="text-center text-[#e5e7eb] mb-6">
        {message}
      </div>
      <div className="flex gap-[0.6rem] mt-[0.8rem]">
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant={variant}
          fullWidth
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
        <Button
          onClick={onClose}
          disabled={loading}
          variant="secondary"
          fullWidth
        >
          {cancelText}
        </Button>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 bg-[rgba(0,0,0,0.75)] flex items-center justify-center z-[300]`}>
        {content}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.75)] flex items-center justify-center z-[300]">
      {content}
    </div>
  )
}

export default ConfirmationDialog

