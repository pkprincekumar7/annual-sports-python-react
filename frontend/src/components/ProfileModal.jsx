import { useState, useEffect } from 'react'
import { Modal } from './ui'
import { useEventYearWithFallback } from '../hooks'
import { fetchCurrentUser } from '../utils/api'
import logger from '../utils/logger'

function ProfileModal({ isOpen, onClose, loggedInUser, selectedEventId, onUserUpdate = null }) {
  const { eventId } = useEventYearWithFallback(selectedEventId)
  const [profileUser, setProfileUser] = useState(loggedInUser)
  
  // Refetch user data when modal opens with correct event_id to get batch_name
  useEffect(() => {
    if (isOpen && eventId && loggedInUser) {
      // Only refetch if batch_name is missing or if we need to update for the selected event
      const shouldRefetch = !loggedInUser.batch_name || !!selectedEventId
      
      if (shouldRefetch) {
        fetchCurrentUser(eventId)
          .then(result => {
            if (result.user) {
              setProfileUser(result.user)
              // Update parent component's loggedInUser if callback is provided
              if (onUserUpdate) {
                onUserUpdate(result.user)
              }
            }
          })
          .catch(error => {
            logger.warn('Error refetching user data for profile:', error)
            // Fallback to existing loggedInUser
            setProfileUser(loggedInUser)
          })
      } else {
        setProfileUser(loggedInUser)
      }
    } else if (isOpen && loggedInUser) {
      setProfileUser(loggedInUser)
    }
  }, [isOpen, eventId, loggedInUser, selectedEventId, onUserUpdate])
  
  if (!profileUser) return null

  const batchDisplay = profileUser.batch_name || 'N/A'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Profile"
      headerLabel={null}
      maxWidth="max-w-[600px]"
    >
      <div className="space-y-4">
        <div className="p-4 bg-[rgba(15,23,42,0.6)] rounded-lg border border-[rgba(148,163,184,0.3)] overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <tbody>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Full Name:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{profileUser.full_name || 'N/A'}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Registration Number:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{profileUser.reg_number || 'N/A'}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Gender:</td>
                <td className="text-[#ffe66d] text-base py-2 capitalize break-words text-left font-semibold">{profileUser.gender || 'N/A'}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Department/Branch:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{profileUser.department_branch || 'N/A'}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Batch:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{batchDisplay}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Mobile Number:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{profileUser.mobile_number || 'N/A'}</td>
              </tr>
              <tr>
                <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Email ID:</td>
                <td className="text-[#ffe66d] text-base py-2 break-words text-left font-semibold">{profileUser.email_id || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {profileUser.captain_in && profileUser.captain_in.length > 0 && (
          <div className="p-4 bg-[rgba(15,23,42,0.6)] rounded-lg border border-[rgba(148,163,184,0.3)] overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <tbody>
                <tr>
                  <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Captain For:</td>
                  <td className="py-2 text-left">
                    <div className="flex flex-wrap gap-2">
                      {profileUser.captain_in.map((sport, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full bg-[rgba(255,230,109,0.2)] text-[#ffe66d] text-sm font-semibold border border-[rgba(255,230,109,0.4)] break-words"
                        >
                          {sport}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {profileUser.coordinator_in && profileUser.coordinator_in.length > 0 && (
          <div className="p-4 bg-[rgba(15,23,42,0.6)] rounded-lg border border-[rgba(148,163,184,0.3)] overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <tbody>
                <tr>
                  <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">Coordinator For:</td>
                  <td className="py-2 text-left">
                    <div className="flex flex-wrap gap-2">
                      {profileUser.coordinator_in.map((sport, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full bg-[rgba(147,197,253,0.2)] text-[#93c5fd] text-sm font-semibold border border-[rgba(147,197,253,0.4)] break-words"
                        >
                          {sport}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {profileUser.participated_in && profileUser.participated_in.length > 0 && (
          <div className="p-4 bg-[rgba(15,23,42,0.6)] rounded-lg border border-[rgba(148,163,184,0.3)] overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <tbody>
                {profileUser.participated_in.map((participation, index) => (
                  <tr key={index}>
                    <td className="text-[#cbd5ff] text-sm font-semibold py-2 pr-4 align-top text-left">{participation.sport}:</td>
                    <td className="text-[#ffe66d] text-sm py-2 break-words text-left font-semibold">
                      {participation.team_name ? (
                        <span>Team: {participation.team_name}</span>
                      ) : (
                        'Individual'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default ProfileModal

