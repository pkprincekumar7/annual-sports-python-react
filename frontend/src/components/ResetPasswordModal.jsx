import { useState, useEffect } from 'react'
import { Modal, Button, Input } from './ui'
import { useApi } from '../hooks'
import { buildApiUrl } from '../utils/api'
import { validateEmail } from '../utils/formValidation'
import logger from '../utils/logger'

function ResetPasswordModal({ isOpen, onClose, onStatusPopup }) {
  const [regNumber, setRegNumber] = useState('')
  const [emailId, setEmailId] = useState('')
  const { loading, execute } = useApi()

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRegNumber('')
      setEmailId('')
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!regNumber.trim()) {
      onStatusPopup('❌ Please enter your registration number.', 'error', 2500)
      return
    }

    if (!emailId.trim()) {
      onStatusPopup('❌ Please enter your email ID.', 'error', 2500)
      return
    }

    // Validate email format
    if (!validateEmail(emailId)) {
      onStatusPopup('❌ Please enter a valid email ID.', 'error', 2500)
      return
    }

    try {
      await execute(
        () => fetch(buildApiUrl('/identities/reset-password'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reg_number: regNumber.trim(),
            email_id: emailId.trim(),
          }),
        }),
        {
          onSuccess: (data) => {
            // Always show success message (for security, don't reveal if email exists)
            onStatusPopup('✅ If the registration number and email match, a new password has been sent.', 'success', 4000)
            setRegNumber('')
            setEmailId('')
            onClose()
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error resetting password. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
          },
        }
      )
    } catch (err) {
      logger.error('Error resetting password:', err)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset Password"
      maxWidth="max-w-[420px]"
    >
      <form onSubmit={handleSubmit}>
        <div className="mb-4 text-sm text-[#cbd5ff]">
          Enter your registration number and email ID. If they match, we'll send you a new password.
        </div>

        <Input
          label="Registration Number"
          id="reset_reg_number"
          name="reg_number"
          value={regNumber}
          onChange={(e) => setRegNumber(e.target.value)}
          required
        />

        <Input
          label="Email ID"
          id="reset_email_id"
          name="email_id"
          type="email"
          value={emailId}
          onChange={(e) => setEmailId(e.target.value)}
          required
        />

        <div className="flex gap-[0.6rem] mt-[0.8rem]">
          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            fullWidth
          >
            {loading ? 'Sending...' : 'Send New Password'}
          </Button>
          <Button
            type="button"
            onClick={onClose}
            disabled={loading}
            variant="secondary"
            fullWidth
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default ResetPasswordModal
