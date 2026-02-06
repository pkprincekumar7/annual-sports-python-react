import { useState, useEffect, useRef } from 'react'
import { Modal, Button, Input, EmptyState, ConfirmationDialog } from './ui'
import { useApi, useModal, useEventYearWithFallback, useEventYear } from '../hooks'
import { fetchWithAuth, clearCache, clearCachePattern } from '../utils/api'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import logger from '../utils/logger'
import { shouldDisableDatabaseOperations } from '../utils/yearHelpers'

const TABS = {
  ADD_BATCH: 'add_batch',
  REMOVE_BATCH: 'remove_batch'
}

function BatchManagementModal({ isOpen, onClose, onStatusPopup, selectedEventId }) {
  const [activeTab, setActiveTab] = useState(TABS.ADD_BATCH)
  
  // Add Batch State
  const [batchName, setBatchName] = useState('')
  const [batchNameInput, setBatchNameInput] = useState('')
  
  // Remove Batch State
  const [batches, setBatches] = useState([])
  const [expandedBatches, setExpandedBatches] = useState({})
  const [batchToRemove, setBatchToRemove] = useState(null)
  
  const isRefreshingRef = useRef(false)
  const { loading, execute } = useApi()
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const { eventYearConfig } = useEventYear()
  const confirmModal = useModal(false)
  
  // Check if database operations should be disabled
  const operationStatus = shouldDisableDatabaseOperations(eventYearConfig)
  const isOperationDisabled = operationStatus.disabled

  // Fetch batches for Remove Batch tab
  useEffect(() => {
    if (isOpen && activeTab === TABS.REMOVE_BATCH && eventId) {
      fetchWithAuth(buildApiUrlWithYear('/enrollments/batches', eventId))
        .then((res) => {
          if (!res.ok) {
            if (res.status >= 500) {
              throw new Error(`HTTP error! status: ${res.status}`)
            }
            return res.json().then(data => ({ success: true, batches: [] }))
          }
          return res.json()
        })
        .then((data) => {
          if (data.success) {
            setBatches(data.batches || [])
          } else {
            setBatches([])
            if (!isRefreshingRef.current && onStatusPopup && data.error) {
              onStatusPopup(`❌ ${data.error}`, 'error', 2500)
            }
          }
        })
        .catch((err) => {
          setBatches([])
          if (!isRefreshingRef.current && onStatusPopup && err.message && !err.message.includes('HTTP error')) {
            onStatusPopup('❌ Error fetching batches. Please try again.', 'error', 2500)
          }
        })
    }
  }, [isOpen, eventYear, activeTab])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(TABS.ADD_BATCH)
      setBatchName('')
      setBatchNameInput('')
      setExpandedBatches({})
      confirmModal.close()
      setBatchToRemove(null)
    }
  }, [isOpen]) // Removed confirmModal from dependencies to prevent infinite loop

  const handleAddBatchSubmit = async (e) => {
    e.preventDefault()

    if (!batchName.trim()) {
      onStatusPopup('❌ Please enter a batch name.', 'error', 2500)
      return
    }

    try {
      await execute(
        () => fetchWithAuth('/enrollments/add-batch', {
          method: 'POST',
          body: JSON.stringify({
            name: batchName.trim(),
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            clearCache(buildApiUrlWithYear('/enrollments/batches', eventId))
            // Clear players cache as batch creation affects player data structure
            clearCachePattern('/identities/players')
            
            onStatusPopup(
              `✅ Batch "${batchName}" created successfully!`,
              'success',
              3000
            )
            setBatchName('')
            setBatchNameInput('')
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error creating batch. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
          },
        }
      )
    } catch (err) {
      logger.error('Error creating batch:', err)
    }
  }

  const handleRemoveBatchClick = (batch) => {
    // Check if batch has players - if so, show error message instead of confirmation
    const playerCount = batch.players?.length || 0
    if (playerCount > 0) {
      onStatusPopup(
        `❌ Cannot remove batch "${batch.name}" because it has ${playerCount} player(s) assigned. Please remove all players from the batch before deleting it.`,
        'error',
        4000
      )
      return
    }
    setBatchToRemove(batch)
    confirmModal.open()
  }

  const handleConfirmRemoveBatch = async () => {
    if (!batchToRemove) return

    const { name } = batchToRemove
    confirmModal.close()
    
    try {
      await execute(
        () => fetchWithAuth('/enrollments/remove-batch', {
          method: 'DELETE',
          body: JSON.stringify({
            name: name,
            event_id: eventId,
          }),
        }),
        {
          onSuccess: (data) => {
            onStatusPopup(
              `✅ Batch "${name}" deleted successfully!`,
              'success',
              3000
            )
            isRefreshingRef.current = true
            clearCache(buildApiUrlWithYear('/enrollments/batches', eventId))
            // Clear players cache pattern to match backend behavior
            clearCachePattern('/identities/players')
            
            fetchWithAuth(buildApiUrlWithYear('/enrollments/batches', eventId), { skipCache: true })
              .then((res) => {
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`)
                }
                return res.json()
              })
              .then((data) => {
                if (data.success) {
                  setBatches(data.batches || [])
                }
              })
              .catch((err) => {
                // Silent error handling
              })
              .finally(() => {
                isRefreshingRef.current = false
              })
            setBatchToRemove(null)
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Error deleting batch. Please try again.'
            onStatusPopup(`❌ ${errorMessage}`, 'error', 3000)
            setBatchToRemove(null)
          },
        }
      )
    } catch (err) {
      logger.error('Error deleting batch:', err)
      setBatchToRemove(null)
    }
  }

  const handleCancelRemove = () => {
    confirmModal.close()
    setBatchToRemove(null)
  }


  const toggleBatch = (batchName) => {
    setExpandedBatches(prev => {
      if (prev[batchName]) {
        const newState = { ...prev }
        delete newState[batchName]
        return newState
      }
      return { [batchName]: true }
    })
  }

  const hasAnyBatches = batches.length > 0

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Batch Management"
        maxWidth="max-w-[700px]"
      >
        {/* Tabs */}
        <div className="flex border-b border-[rgba(148,163,184,0.3)] mb-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab(TABS.ADD_BATCH)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === TABS.ADD_BATCH
                ? 'text-[#ffe66d] border-b-2 border-[#ffe66d]'
                : 'text-[#cbd5ff] hover:text-[#e2e8f0]'
            }`}
          >
            Add Batch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TABS.REMOVE_BATCH)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === TABS.REMOVE_BATCH
                ? 'text-[#ffe66d] border-b-2 border-[#ffe66d]'
                : 'text-[#cbd5ff] hover:text-[#e2e8f0]'
            }`}
          >
            Remove Batch
          </button>
        </div>

        {/* Add Batch Tab */}
        {activeTab === TABS.ADD_BATCH && (
          <form onSubmit={handleAddBatchSubmit}>
            <Input
              label="Batch Name"
              id="batchName"
              name="batchName"
              type="text"
              value={batchNameInput}
              onChange={(e) => {
                setBatchNameInput(e.target.value)
                setBatchName(e.target.value)
              }}
              required
              placeholder="Enter batch name (e.g., 2024-2028, 2025 Batch)"
            />

            <div className="flex gap-[0.6rem] mt-[0.8rem] justify-center">
              <Button
                type="submit"
                disabled={loading || isOperationDisabled}
                loading={loading}
                title={isOperationDisabled ? operationStatus.reason : ''}
              >
                {loading ? 'Creating...' : 'Create'}
              </Button>
              <Button
                type="button"
                onClick={onClose}
                disabled={loading}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Remove Batch Tab */}
        {activeTab === TABS.REMOVE_BATCH && (
          <>
            {!hasAnyBatches ? (
              <EmptyState message="No batches found. Create batches first." className="py-8 text-[0.9rem]" />
            ) : (
              <div className="space-y-2">
                {batches.map((batch) => {
                  const isExpanded = expandedBatches[batch.name]
                  const playerCount = batch.players?.length || 0

                  return (
                    <div
                      key={batch._id || batch.name}
                      className="border border-[rgba(148,163,184,0.6)] rounded-[10px] bg-[rgba(15,23,42,0.9)] overflow-hidden"
                    >
                      <div className="px-[10px] py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
                        <div className="flex items-center gap-3">
                          <span className="text-[#ffe66d] text-lg">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                          <span className="text-[#e2e8f0] text-[0.95rem] font-semibold">
                            {batch.name}
                          </span>
                          <span className="text-[#cbd5ff] text-[0.8rem]">
                            ({playerCount} player{playerCount !== 1 ? 's' : ''})
                          </span>
                        </div>
                        <div className="md:ml-auto">
                          <Button
                            type="button"
                            onClick={() => {
                              if (isOperationDisabled) {
                                onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                                return
                              }
                              handleRemoveBatchClick(batch)
                            }}
                            disabled={isOperationDisabled || loading || playerCount > 0}
                            variant="danger"
                            className="px-4 py-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em]"
                            title={isOperationDisabled ? operationStatus.reason : (playerCount > 0 ? `Cannot remove batch with ${playerCount} player(s). Remove all players first.` : "Remove Batch")}
                          >
                            {loading ? 'Removing...' : 'Remove'}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && playerCount > 0 && (
                        <div className="border-t border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.7)]">
                          {batch.players.map((player) => (
                            <div
                              key={player.reg_number || player}
                              className="px-[10px] py-3 border-b border-[rgba(148,163,184,0.2)] last:border-b-0"
                            >
                              <div className="text-[#e2e8f0] text-[0.9rem] font-semibold">
                                {player.full_name || player}
                              </div>
                              <div className="text-[#cbd5ff] text-[0.8rem]">
                                Reg. No: {player.reg_number || player}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmModal.isOpen && batchToRemove !== null}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemoveBatch}
        title="Remove Batch"
        message={
          batchToRemove ? (
            <>
              Are you sure you want to remove batch <span className="font-semibold text-[#ffe66d]">{batchToRemove.name}</span>?
              <br />
              <span className="text-[0.9rem] text-red-400 mt-2 block">This action cannot be undone.</span>
            </>
          ) : ''
        }
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        loading={loading}
      />
    </>
  )
}

export default BatchManagementModal
