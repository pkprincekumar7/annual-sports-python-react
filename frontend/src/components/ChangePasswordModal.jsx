import { useState, useEffect } from 'react'
import { Modal, Button, Input } from './ui'
import { useApi } from '../hooks'
import { fetchWithAuth } from '../utils/api'
import { validatePassword } from '../utils/formValidation'
import logger from '../utils/logger'

function ChangePasswordModal({ isOpen, onClose, onStatusPopup, onPasswordChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { loading, execute } = useApi()

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validatePassword(currentPassword) || !validatePassword(newPassword) || !validatePassword(confirmPassword)) {
      onStatusPopup('❌ Please fill all fields.', 'error', 2500)
      return
    }

    if (newPassword !== confirmPassword) {
      onStatusPopup('❌ New password and confirm password do not match.', 'error', 2500)
      return
    }

    if (currentPassword === newPassword) {
      onStatusPopup('❌ New password must be different from current password.', 'error', 2500)
      return
    }

    try {
      await execute(
        () => fetchWithAuth('/identities/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            current_password: currentPassword.trim(),
            new_password: newPassword.trim(),
          }),
        }),
        {
          onSuccess: (data) => {
            onStatusPopup('✅ Password changed successfully!', 'success', 2500)
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            if (onPasswordChanged) {
              onPasswordChanged()
            }
            onClose()
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error changing password. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
          },
        }
      )
    } catch (err) {
      logger.error('Error changing password:', err)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Password"
      maxWidth="max-w-[420px]"
    >
      <form onSubmit={handleSubmit}>
        <Input
          label="Current Password"
          id="current_password"
          name="current_password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />

        <Input
          label="New Password"
          id="new_password"
          name="new_password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <Input
          label="Confirm New Password"
          id="confirm_password"
          name="confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <div className="flex gap-[0.6rem] mt-[0.8rem]">
          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            fullWidth
          >
            {loading ? 'Changing...' : 'Change Password'}
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

export default ChangePasswordModal
