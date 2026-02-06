import { useState, useEffect, useRef } from 'react'
import { Modal, Button, Input, LoadingSpinner, EmptyState, ConfirmationDialog } from './ui'
import { useApi, useEventYearWithFallback, useEventYear } from '../hooks'
import { fetchWithAuth, buildApiUrl, clearCache, clearCachePattern } from '../utils/api'
import { buildApiUrlWithYear } from '../utils/apiHelpers'
import { GENDER_OPTIONS, DEFAULT_PLAYERS_PAGE_SIZE } from '../constants/app'
import logger from '../utils/logger'
import { trimFormData, validateEmail, validatePhone, validateRequired } from '../utils/formValidation'
import { shouldDisableDatabaseOperations } from '../utils/yearHelpers'

function PlayerListModal({ isOpen, onClose, onStatusPopup, selectedEventId }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState(null)
  const [editedData, setEditedData] = useState({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [playerToDelete, setPlayerToDelete] = useState(null)
  const [playerEnrollments, setPlayerEnrollments] = useState({ 
    nonTeamEvents: [], 
    teams: [], 
    matches: [],
    hasMatches: false
  })
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)
  const [selectedPlayers, setSelectedPlayers] = useState(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: DEFAULT_PLAYERS_PAGE_SIZE,
    hasNextPage: false,
    hasPreviousPage: false
  })
  const [bulkDeleteError, setBulkDeleteError] = useState(null)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkDeleteEnrollments, setBulkDeleteEnrollments] = useState({}) // Map of reg_number -> enrollments
  const [loadingBulkEnrollments, setLoadingBulkEnrollments] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  // Use constant for page size - ensures consistency across pagination and search
  const PAGE_SIZE = DEFAULT_PLAYERS_PAGE_SIZE
  const { loading: saving, execute } = useApi()
  const { loading: deleting, execute: executeDelete } = useApi()
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [departments, setDepartments] = useState([])
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const { eventYear, eventId } = useEventYearWithFallback(selectedEventId)
  const { eventYearConfig } = useEventYear()
  const isRefreshingRef = useRef(false) // Use ref to track if we're refreshing after update
  const searchTimeoutRef = useRef(null) // Use ref for debouncing search
  
  // Check if database operations should be disabled
  const operationStatus = shouldDisableDatabaseOperations(eventYearConfig)
  const isOperationDisabled = operationStatus.disabled
  const clearButtonRef = useRef(null) // Ref for clear button
  const [clearButtonTop, setClearButtonTop] = useState(null) // Dynamic top position for clear button

  // Fetch departments for department_branch dropdown
  useEffect(() => {
    if (!isOpen) {
      setDepartments([])
      setLoadingDepartments(false)
      return
    }
    
    let isMounted = true
    const abortController = new AbortController()
    
    const fetchDepartments = async () => {
      setLoadingDepartments(true)
      try {
        // Use regular fetch (not fetchWithAuth) since departments endpoint is public
        const res = await fetch(buildApiUrl('/departments'), { signal: abortController.signal })
        if (!isMounted) return
        
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            const deptOptions = (data.departments || []).map(dept => ({
              value: dept.name,
              label: dept.name
            }))
            setDepartments(deptOptions)
          } else {
            setDepartments([])
          }
        } else {
          setDepartments([])
        }
      } catch (err) {
        if (!isMounted || err.name === 'AbortError') return
        setDepartments([])
        logger.error('Error fetching departments:', err)
      } finally {
        if (isMounted) {
          setLoadingDepartments(false)
        }
      }
    }
    
    fetchDepartments()
    
    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [isOpen])

  // Generate department options from fetched departments
  const departmentOptions = departments

  // Function to fetch players (extracted for reuse)
  // showError: whether to show error popup (default: true for initial load, false for silent refresh)
  // search: optional search query to filter players
  // page: page number for pagination
  const fetchPlayers = async (signal = null, showError = true, search = null, page = 1) => {
    setLoading(true)
    try {
      let url = buildApiUrlWithYear('/identities/players', eventId)
      const baseSeparator = url.includes('?') ? '&' : '?'
      url += `${baseSeparator}page=${page}&limit=${PAGE_SIZE}`
      if (search && search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`
      }
      const response = await fetchWithAuth(url, {
        signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Server-side search and pagination: players array contains only the filtered and paginated data from API
        // Admin user is already filtered out on the server side
        setPlayers(data.players || [])
        // Update pagination info from API response (server-side pagination metadata)
        if (data.pagination) {
          setPagination(data.pagination)
          setCurrentPage(data.pagination.currentPage)
        } else if (data.totalCount !== undefined) {
          // Fallback: if pagination not present but totalCount is (non-paginated response)
          // This shouldn't happen for PlayerListModal since we always pass page param, but handle defensively
          setPagination(prev => ({
            ...prev,
            totalCount: data.totalCount,
            totalPages: 1,
            currentPage: 1
          }))
        }
      } else {
        throw new Error(data.error || 'Failed to fetch players')
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      // Don't show error if we're in the middle of a refresh after update
      if (showError && onStatusPopup && !isRefreshingRef.current) {
        onStatusPopup('❌ Error fetching players. Please try again.', 'error', 3000)
      }
      // Re-throw error so caller can handle it if needed
      throw err
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setPlayers([])
      setEditingPlayer(null)
      setEditedData({})
      setDeleteConfirmOpen(false)
      setPlayerToDelete(null)
      setPlayerEnrollments({ nonTeamEvents: [], teams: [], matches: [], hasMatches: false })
      setSelectedPlayers(new Set())
      setCurrentPage(1)
      setBulkDeleteError(null)
      setBulkDeleteConfirmOpen(false)
      setBulkDeleteEnrollments({})
      setSearchQuery('')
      setSearchInput('')
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: DEFAULT_PLAYERS_PAGE_SIZE,
        hasNextPage: false,
        hasPreviousPage: false
      })
      // Clear search timeout if modal closes
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      return
    }

    const abortController = new AbortController()
    fetchPlayers(abortController.signal, true, searchQuery, currentPage)

    return () => {
      abortController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eventId, searchQuery, currentPage]) // Include eventId, searchQuery, and currentPage to refetch when they change

  // Debounced search effect
  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
      setCurrentPage(1) // Reset to first page when searching
      setSelectedPlayers(new Set()) // Clear selections when searching
    }, 300) // 300ms debounce delay

    // Cleanup timeout on unmount or when searchInput changes
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchInput])

  // Calculate clear button position to center it with input field
  useEffect(() => {
    if (!searchInput || !isOpen) return
    
    // Use setTimeout to ensure DOM is rendered
    const calculatePosition = () => {
      const inputElement = document.getElementById('searchPlayer')
      const containerElement = inputElement?.closest('.relative')
      
      if (inputElement && containerElement && clearButtonRef.current) {
        const inputRect = inputElement.getBoundingClientRect()
        const containerRect = containerElement.getBoundingClientRect()
        
        if (containerRect && inputRect) {
          // Calculate the center of the input field relative to the container
          const inputCenterY = inputRect.top - containerRect.top + (inputRect.height / 2)
          // Center the button (accounting for button's own height)
          const buttonHeight = clearButtonRef.current.offsetHeight || 20
          const topPosition = inputCenterY - (buttonHeight / 2)
          setClearButtonTop(topPosition)
        }
      }
    }
    
    // Calculate immediately and after a short delay to ensure layout is complete
    calculatePosition()
    const timeoutId = setTimeout(calculatePosition, 10)
    
    return () => clearTimeout(timeoutId)
  }, [searchInput, isOpen])

  // Recalculate on window resize
  useEffect(() => {
    if (!searchInput || !isOpen) return
    
    const handleResize = () => {
      const inputElement = document.getElementById('searchPlayer')
      const containerElement = inputElement?.closest('.relative')
      
      if (inputElement && containerElement && clearButtonRef.current) {
        const inputRect = inputElement.getBoundingClientRect()
        const containerRect = containerElement.getBoundingClientRect()
        
        if (containerRect && inputRect) {
          const inputCenterY = inputRect.top - containerRect.top + (inputRect.height / 2)
          const buttonHeight = clearButtonRef.current.offsetHeight || 20
          const topPosition = inputCenterY - (buttonHeight / 2)
          setClearButtonTop(topPosition)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [searchInput, isOpen])

  // Server-side pagination: players array contains only the current page's data from API
  // No client-side pagination or filtering - all pagination handled by backend
  const currentPagePlayers = players
  const currentPageSelectedCount = currentPagePlayers.filter(p => selectedPlayers.has(p.reg_number)).length
  const isAllCurrentPageSelected = currentPagePlayers.length > 0 && currentPageSelectedCount === currentPagePlayers.length


  const handlePlayerClick = (player) => {
    setEditingPlayer(player.reg_number)
    setEditedData({
      reg_number: player.reg_number,
      full_name: player.full_name,
      gender: player.gender,
      department_branch: player.department_branch,
      batch_name: player.batch_name, // Store batch name
      mobile_number: player.mobile_number,
      email_id: player.email_id,
    })
  }

  const handleEditClick = (e, player) => {
    e.stopPropagation()
    handlePlayerClick(player)
  }

  const handleDeleteClick = async (e, player) => {
    e.stopPropagation()
    setPlayerToDelete(player)
    setLoadingEnrollments(true)
    setDeleteConfirmOpen(true)

    try {
      // Fetch player enrollments
      const response = await fetchWithAuth(
        buildApiUrlWithYear(`/sports-participations/player-enrollments/${player.reg_number}`, eventId)
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        setPlayerEnrollments({
          nonTeamEvents: data.nonTeamEvents || [],
          teams: data.teams || [],
          matches: data.matches || [],
          hasMatches: data.hasMatches || false
        })
      } else {
        throw new Error(data.error || 'Failed to fetch enrollments')
      }
    } catch (err) {
      logger.error('Error fetching player enrollments:', err)
      if (onStatusPopup) {
        onStatusPopup('❌ Error fetching player enrollments. Please try again.', 'error', 3000)
      }
      setDeleteConfirmOpen(false)
      setPlayerToDelete(null)
    } finally {
      setLoadingEnrollments(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!playerToDelete) return

    // Safety check: if player is in any team - cannot delete (should not reach here due to button logic)
    if (playerEnrollments.teams.length > 0) {
      handleDeleteCancel()
      return
    }

    // Safety check: if player has matches - cannot delete
    if (playerEnrollments.hasMatches && playerEnrollments.matches.length > 0) {
      handleDeleteCancel()
      return
    }

    try {
      await executeDelete(
        () => fetchWithAuth(
          buildApiUrlWithYear(`/identities/delete-player/${playerToDelete.reg_number}`, eventId),
          {
            method: 'DELETE',
          }
        ),
        {
          onSuccess: (data) => {
            if (onStatusPopup) {
              const eventCount = playerEnrollments.nonTeamEvents.length
              onStatusPopup(
                `✅ Player deleted successfully! Removed from ${eventCount} event(s).`,
                'success',
                3000
              )
            }
            // Refresh players list
            isRefreshingRef.current = true
            // Clear players cache pattern to match backend behavior
            clearCachePattern('/identities/players')
            clearCachePattern('/sports-participations/teams')
            clearCachePattern('/sports-participations/participants')
            clearCachePattern('/sports-participations/sports-counts')
            clearCachePattern('/schedulings/event-schedule')
            fetchPlayers(null, false, searchQuery, currentPage).finally(() => {
              isRefreshingRef.current = false
            })
            setDeleteConfirmOpen(false)
            setPlayerToDelete(null)
            setPlayerEnrollments({ nonTeamEvents: [], teams: [], matches: [], hasMatches: false })
          },
          onError: (err) => {
            const errorMessage = err?.message || err?.error || 'Failed to delete player. Please try again.'
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
            }
          },
        }
      )
    } catch (err) {
      logger.error('Error deleting player:', err)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false)
    setPlayerToDelete(null)
    setPlayerEnrollments({ nonTeamEvents: [], teams: [], matches: [], hasMatches: false })
  }

  // Multi-select handlers
  const handleSelectPlayer = (regNumber) => {
    setSelectedPlayers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(regNumber)) {
        newSet.delete(regNumber)
      } else {
        if (newSet.size >= PAGE_SIZE) {
          if (onStatusPopup) {
            onStatusPopup(`❌ Maximum ${PAGE_SIZE} players can be selected at a time.`, 'error', 3000)
          }
          return prev
        }
        newSet.add(regNumber)
      }
      return newSet
    })
  }

  const handleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      // Deselect all on current page
      setSelectedPlayers(prev => {
        const newSet = new Set(prev)
        currentPagePlayers.forEach(player => {
          newSet.delete(player.reg_number)
        })
        return newSet
      })
    } else {
      // Select all on current page (if within limit)
      const currentSelectedCount = selectedPlayers.size
      
      // Filter out players from current page that are already selected
      const alreadySelectedOnPage = currentPagePlayers.filter(player => 
        selectedPlayers.has(player.reg_number)
      )
      const notSelectedOnPage = currentPagePlayers.filter(player => 
        !selectedPlayers.has(player.reg_number)
      )
      
      // Calculate how many new players we can select
      const availableSlots = PAGE_SIZE - currentSelectedCount
      const canSelectAll = notSelectedOnPage.length <= availableSlots
      
      if (!canSelectAll) {
        // Cannot select all players on current page due to limit
        if (onStatusPopup) {
          onStatusPopup(`❌ Maximum ${PAGE_SIZE} players can be selected at a time. Cannot select all ${currentPagePlayers.length} players on this page.`, 'error', 3000)
        }
        return // Don't select any if we can't select all
      }
      
      // Select all players on current page that aren't already selected
      setSelectedPlayers(prev => {
        const newSet = new Set(prev)
        notSelectedOnPage.forEach(player => {
          newSet.add(player.reg_number)
        })
        return newSet
      })
    }
  }

  // Bulk delete handlers
  const handleBulkDeleteClick = async () => {
    if (selectedPlayers.size === 0) {
      if (onStatusPopup) {
        onStatusPopup('❌ Please select at least one player to delete.', 'error', 2500)
      }
      return
    }
    
    setBulkDeleteError(null)
    setLoadingBulkEnrollments(true)
    setBulkDeleteConfirmOpen(true)
    
    const regNumbers = Array.from(selectedPlayers)
    
    try {
      // OPTIMIZATION: Fetch enrollments for all selected players in a single API call
      const response = await fetchWithAuth(
        buildApiUrlWithYear('/identities/bulk-player-enrollments', eventId),
        {
          method: 'POST',
          body: JSON.stringify({ reg_numbers: regNumbers }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      if (data.success && data.enrollments) {
        setBulkDeleteEnrollments(data.enrollments)
      } else {
        throw new Error(data.error || 'Failed to fetch enrollments')
      }
    } catch (err) {
      logger.error('Error fetching bulk delete enrollments:', err)
      if (onStatusPopup) {
        onStatusPopup('❌ Error fetching player enrollments. Please try again.', 'error', 3000)
      }
      setBulkDeleteConfirmOpen(false)
    } finally {
      setLoadingBulkEnrollments(false)
    }
  }

  const handleBulkDeleteConfirm = async () => {
    if (selectedPlayers.size === 0) return

    // Safety check: if any player is in any team - cannot delete
    const playersWithTeams = []
    const playersWithMatches = []
    
    for (const regNumber of Array.from(selectedPlayers)) {
      const enrollments = bulkDeleteEnrollments[regNumber]
      if (enrollments) {
        if (enrollments.teams && enrollments.teams.length > 0) {
          playersWithTeams.push({
            reg_number: regNumber,
            full_name: enrollments.player?.full_name || regNumber,
            teams: enrollments.teams
          })
        }
        if (enrollments.hasMatches && enrollments.matches && enrollments.matches.length > 0) {
          playersWithMatches.push({
            reg_number: regNumber,
            full_name: enrollments.player?.full_name || regNumber,
            matches: enrollments.matches
          })
        }
      }
    }
    
    // If any players cannot be deleted, show error and prevent deletion
    if (playersWithTeams.length > 0 || playersWithMatches.length > 0) {
      setBulkDeleteError({
        playersWithTeams,
        playersWithMatches,
        message: 'Some players cannot be deleted due to constraints'
      })
      return
    }

    const regNumbers = Array.from(selectedPlayers)
    setBulkDeleting(true)

    try {
      const response = await fetchWithAuth(
        buildApiUrlWithYear('/identities/bulk-delete-players', eventId),
        {
          method: 'POST',
          body: JSON.stringify({ reg_numbers: regNumbers }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        // Check if error contains constraint violation details
        if (data.playersWithTeams || data.playersWithMatches) {
          setBulkDeleteError({
            playersWithTeams: data.playersWithTeams || [],
            playersWithMatches: data.playersWithMatches || [],
            message: data.error || 'Some players cannot be deleted due to constraints'
          })
        } else {
          // Handle registration period errors and other validation errors
          const errorMessage = data.error || data.message || 'Failed to delete players. Please try again.'
          // If it's a registration period error or other validation error, show it in the dialog
          if (errorMessage.includes('registration period') || errorMessage.includes('only allowed during')) {
            setBulkDeleteError({
              playersWithTeams: [],
              playersWithMatches: [],
              message: errorMessage
            })
          } else {
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
            }
            setBulkDeleteConfirmOpen(false)
          }
        }
        return
      }

      // Success
      if (onStatusPopup) {
        // Calculate total events removed
        const totalEventsRemoved = data.deleted_events 
          ? Object.values(data.deleted_events).reduce((total, events) => total + (events?.length || 0), 0)
          : 0
        
        let message = `✅ Successfully deleted ${data.deleted_count} player(s).`
        if (totalEventsRemoved > 0) {
          message += ` Removed from ${totalEventsRemoved} non-team event enrollment(s).`
        }
        
        onStatusPopup(
          message,
          'success',
          4000
        )
      }
      // Refresh players list
      isRefreshingRef.current = true
      // Clear players cache pattern to match backend behavior
      clearCachePattern('/identities/players')
      // If we're on a page that might be empty after deletion, go to previous page or page 1
      const newPage = currentPage > 1 ? currentPage - 1 : 1
      fetchPlayers(null, false, searchQuery, newPage).finally(() => {
        isRefreshingRef.current = false
      })
      setBulkDeleteConfirmOpen(false)
      setSelectedPlayers(new Set())
      setBulkDeleteError(null)
      setBulkDeleteEnrollments({})
    } catch (err) {
      logger.error('Error bulk deleting players:', err)
      const errorMessage = err?.message || err?.error || 'Failed to delete players. Please try again.'
      if (onStatusPopup) {
        onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
      }
      setBulkDeleteConfirmOpen(false)
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleBulkDeleteCancel = () => {
    setBulkDeleteConfirmOpen(false)
    setBulkDeleteError(null)
    setBulkDeleteEnrollments({})
  }

  // Search handlers
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
    // Search will be triggered automatically via debounced useEffect
  }

  const handleClearSearch = () => {
    setSearchInput('')
    // searchQuery will be updated automatically via debounced useEffect
    setCurrentPage(1) // Reset to first page when clearing
    setSelectedPlayers(new Set()) // Clear selections when clearing
  }

  const handleCancelEdit = () => {
    setEditingPlayer(null)
    setEditedData({})
  }

  const handleFieldChange = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSavePlayer = async () => {
    const trimmed = trimFormData(editedData)
    const requiredValidation = validateRequired({
      'Registration number': trimmed.reg_number,
      'Full name': trimmed.full_name,
      Gender: trimmed.gender,
      'Department/Branch': trimmed.department_branch,
      'Mobile number': trimmed.mobile_number,
      'Email ID': trimmed.email_id,
    })
    if (!requiredValidation.isValid) {
      if (onStatusPopup) {
        onStatusPopup(`❌ ${requiredValidation.errors.join(' ')}`, 'error', 2500)
      }
      return
    }

    if (!validateEmail(trimmed.email_id)) {
      if (onStatusPopup) {
        onStatusPopup('❌ Invalid email format.', 'error', 2500)
      }
      return
    }

    if (!validatePhone(trimmed.mobile_number)) {
      if (onStatusPopup) {
        onStatusPopup('❌ Invalid mobile number. Must be 10 digits.', 'error', 2500)
      }
      return
    }

    try {
      // Exclude batch_name from update request (it cannot be modified)
      // Include gender (required by backend validation, but backend prevents changes)
      const { batch_name, ...updateData } = trimmed
      
      await execute(
        () => fetchWithAuth('/identities/update-player', {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }),
        {
          onSuccess: (data) => {
            if (onStatusPopup) {
              onStatusPopup('✅ Player details updated successfully!', 'success', 2500)
            }
            // Refresh players list silently (don't show error if refresh fails)
            // Set flag to prevent error popups during refresh
            isRefreshingRef.current = true
            
            // Clear cache first to ensure we get fresh data (use pattern to match backend)
            clearCachePattern('/identities/players')
            
            // Use a separate function to avoid showing loading state and errors
            let refreshUrl = buildApiUrlWithYear('/identities/players', eventId)
            const baseSeparator = refreshUrl.includes('?') ? '&' : '?'
            refreshUrl += `${baseSeparator}page=${currentPage}&limit=${PAGE_SIZE}`
            if (searchQuery && searchQuery.trim()) {
              refreshUrl += `&search=${encodeURIComponent(searchQuery.trim())}`
            }
            fetchWithAuth(refreshUrl)
              .then((response) => {
                if (!response.ok) {
                  isRefreshingRef.current = false
                  return
                }
                return response.json()
              })
              .then((refreshData) => {
                if (refreshData && refreshData.success) {
                  // Server-side search and pagination: admin user already filtered on server
                  setPlayers(refreshData.players || [])
                  // Update pagination info from API response
                  if (refreshData.pagination) {
                    setPagination(refreshData.pagination)
                    setCurrentPage(refreshData.pagination.currentPage)
                  } else if (refreshData.totalCount !== undefined) {
                    // Fallback: if pagination not present but totalCount is (non-paginated response)
                    setPagination(prev => ({
                      ...prev,
                      totalCount: refreshData.totalCount,
                      totalPages: 1,
                      currentPage: 1
                    }))
                  }
                }
              })
              .catch(() => {
                // Don't show popup - the update was successful
              })
              .finally(() => {
                isRefreshingRef.current = false
              })
            setEditingPlayer(null)
            setEditedData({})
          },
          onError: (err) => {
            // The useApi hook extracts the error message from the API response
            const errorMessage = err?.message || err?.error || 'Failed to update player. Please try again.'
            if (onStatusPopup) {
              onStatusPopup(`❌ ${errorMessage}`, 'error', 4000)
            }
          },
        }
      )
    } catch (err) {
      // This catch handles cases where execute throws before onError is called
      // Don't show duplicate error message - onError should have handled it
      logger.error('Error updating player:', err)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="List Players"
      maxWidth="max-w-[800px]"
    >
      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Input
            label="Search by Registration Number or Name"
            id="searchPlayer"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Type reg. number or name to search..."
            className={searchInput ? "pr-8" : ""}
          />
          {searchInput && (
            <button
              ref={clearButtonRef}
              type="button"
              onClick={handleClearSearch}
              disabled={loading}
              className="absolute right-[10px] text-[#cbd5ff] hover:text-[#ffe66d] transition-colors cursor-pointer bg-transparent border-none text-xl leading-none disabled:opacity-50 disabled:cursor-not-allowed z-10"
              style={{
                top: clearButtonTop !== null ? `${clearButtonTop}px` : 'calc(0.78rem * 1.2 + 0.25rem + 0.5rem + 0.45rem)'
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading && (
        <LoadingSpinner message="Loading players..." />
      )}

      {!loading && players.length === 0 && (
        <EmptyState
          message={searchQuery ? 'No players found matching your search.' : 'No players found.'}
          className="py-8"
        />
      )}

      {!loading && (players.length > 0 || pagination.totalCount > 0) && (
        <>
          {/* Bulk Actions */}
          <div className="mb-4 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
            <div className="text-[0.75rem] sm:text-[0.9rem] text-[#cbd5ff]">
              {searchQuery ? (
                <>
                  Found: <span className="text-[#ffe66d] font-bold">{pagination.totalCount || players.length}</span> player{(pagination.totalCount || players.length) !== 1 ? 's' : ''}
                  {pagination.totalPages > 1 && (
                    <span className="ml-1 sm:ml-2">
                      (Page {pagination.currentPage || currentPage} of {pagination.totalPages || 1})
                    </span>
                  )}
                </>
              ) : (
                <>
                  Total Players: <span className="text-[#ffe66d] font-bold">{pagination.totalCount || players.length}</span>
                  {pagination.totalPages > 1 && (
                    <span className="ml-1 sm:ml-2">
                      (Page {pagination.currentPage || currentPage} of {pagination.totalPages || 1})
                    </span>
                  )}
                </>
              )}
              {selectedPlayers.size > 0 && (
                <span className="ml-2 sm:ml-3">
                  Selected: <span className="text-[#ffe66d] font-bold">{selectedPlayers.size}</span> / {PAGE_SIZE}
                </span>
              )}
            </div>
            {selectedPlayers.size > 0 && (
              <Button
                type="button"
                onClick={() => {
                  if (isOperationDisabled) {
                    onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                    return
                  }
                  handleBulkDeleteClick()
                }}
                disabled={isOperationDisabled || bulkDeleting}
                title={isOperationDisabled ? operationStatus.reason : ''}
                variant="danger"
                className="px-2 py-1 sm:px-4 sm:py-2 text-[0.75rem] sm:text-[0.85rem]"
              >
                Delete Selected ({selectedPlayers.size})
              </Button>
            )}
          </div>

          {/* Pagination */}
          {(() => {
            const totalPages = pagination.totalPages || 1
            const currentPageNum = pagination.currentPage || currentPage || 1
            const totalCount = pagination.totalCount || players.length || 0
            
            if (totalPages <= 1 && totalCount === 0) return null
            
            return (
              <div className="mb-3 sm:mb-4 flex flex-col items-center gap-1.5 sm:gap-3">
                {/* Pagination buttons - responsive layout */}
                <div className="flex items-center justify-center gap-0.5 sm:gap-2 flex-wrap">
                  {/* First button - visible on medium+ devices, hidden on small */}
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={!pagination.hasPreviousPage || currentPageNum === 1}
                    variant="secondary"
                    className="hidden md:flex !px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    First
                  </Button>
                  
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={!pagination.hasPreviousPage || currentPageNum === 1}
                    variant="secondary"
                    className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    Prev
                  </Button>
                  
                  {/* Page Numbers */}
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-center">
                    {(() => {
                      const pages = []
                      
                      // Show up to 3 page numbers around current page
                      let startPage, endPage
                      
                      if (currentPageNum <= 3) {
                        // At the start: show first 3 pages
                        startPage = 1
                        endPage = Math.min(3, totalPages)
                      } else if (currentPageNum >= totalPages - 2) {
                        // At the end: show last 3 pages
                        startPage = Math.max(1, totalPages - 2)
                        endPage = totalPages
                      } else {
                        // In the middle: show current page and one on each side
                        startPage = currentPageNum - 1
                        endPage = currentPageNum + 1
                      }
                      
                      // Add first page if not in range
                      if (startPage > 1) {
                        pages.push(
                          <Button
                            key={1}
                            type="button"
                            onClick={() => setCurrentPage(1)}
                            variant={currentPageNum === 1 ? "primary" : "secondary"}
                            className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !min-w-[1.75rem] sm:!min-w-[2.5rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                          >
                            1
                          </Button>
                        )
                        if (startPage > 2) {
                          pages.push(
                            <span key="ellipsis1" className="text-[#cbd5ff] px-0.5 sm:px-1 text-[0.65rem] sm:text-[0.8rem]">
                              ...
                            </span>
                          )
                        }
                      }
                      
                      // Add page numbers in range
                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <Button
                            key={i}
                            type="button"
                            onClick={() => setCurrentPage(i)}
                            variant={currentPageNum === i ? "primary" : "secondary"}
                            className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !min-w-[1.75rem] sm:!min-w-[2.5rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                          >
                            {i}
                          </Button>
                        )
                      }
                      
                      // Add last page if not in range
                      if (endPage < totalPages) {
                        if (endPage < totalPages - 1) {
                          pages.push(
                            <span key="ellipsis2" className="text-[#cbd5ff] px-0.5 sm:px-1 text-[0.65rem] sm:text-[0.8rem]">
                              ...
                            </span>
                          )
                        }
                        pages.push(
                          <Button
                            key={totalPages}
                            type="button"
                            onClick={() => setCurrentPage(totalPages)}
                            variant={currentPageNum === totalPages ? "primary" : "secondary"}
                            className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !min-w-[1.75rem] sm:!min-w-[2.5rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                          >
                            {totalPages}
                          </Button>
                        )
                      }
                      
                      return pages
                    })()}
                  </div>
                  
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={!pagination.hasNextPage || currentPageNum === totalPages}
                    variant="secondary"
                    className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    Next
                  </Button>
                  
                  {/* Last button - visible on medium+ devices, hidden on small */}
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={!pagination.hasNextPage || currentPageNum === totalPages}
                    variant="secondary"
                    className="hidden md:flex !px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    Last
                  </Button>
                </div>
                
                {/* First and Last buttons - visible only on small devices, below Prev and Next */}
                <div className="flex md:hidden items-center justify-center gap-0.5 sm:gap-2">
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={!pagination.hasPreviousPage || currentPageNum === 1}
                    variant="secondary"
                    className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    First
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={!pagination.hasNextPage || currentPageNum === totalPages}
                    variant="secondary"
                    className="!px-1.5 !py-0.5 sm:!px-3 sm:!py-1 !text-[0.65rem] sm:!text-[0.8rem] !leading-tight !tracking-normal sm:!tracking-[0.1em]"
                  >
                    Last
                  </Button>
                </div>
                
                <div className="text-[0.7rem] sm:text-[0.9rem] text-[#cbd5ff] text-center px-2">
                  Page <span className="text-[#ffe66d] font-bold">{currentPageNum}</span> of <span className="text-[#ffe66d] font-bold">{totalPages}</span>
                  {totalCount > 0 && (
                    <span className="ml-1 sm:ml-2">
                      • Total: <span className="text-[#ffe66d] font-bold">{totalCount}</span> player{totalCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Select All Checkbox */}
          {currentPagePlayers.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isAllCurrentPageSelected}
                onChange={handleSelectAllCurrentPage}
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.6)] text-[#ffe66d] focus:ring-[#ffe66d] focus:ring-2 cursor-pointer"
              />
              <label className="text-[0.8rem] sm:text-[0.9rem] text-[#cbd5ff] cursor-pointer">
                Select All (Current Page)
              </label>
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {currentPagePlayers.map((player) => {
              const isEditing = editingPlayer === player.reg_number
              return (
                <div
                  key={player.reg_number}
                  className={`px-2 py-2 sm:px-4 sm:py-3 rounded-[12px] border ${
                    isEditing
                      ? 'border-[rgba(255,230,109,0.5)] bg-[rgba(255,230,109,0.05)]'
                      : 'border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.6)] cursor-pointer hover:bg-[rgba(15,23,42,0.8)] transition-colors'
                  }`}
                  onClick={() => !isEditing && handlePlayerClick(player)}
                >
                  {!isEditing ? (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3 md:gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedPlayers.has(player.reg_number)}
                          onChange={(e) => {
                            e.stopPropagation()
                            handleSelectPlayer(player.reg_number)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.6)] text-[#ffe66d] focus:ring-[#ffe66d] focus:ring-2 cursor-pointer flex-shrink-0"
                        />
                        <div>
                          <div className="text-[#e5e7eb] font-semibold text-[0.85rem] sm:text-[0.95rem]">
                            {player.full_name}
                          </div>
                          <div className="text-[#a5b4fc] text-[0.7rem] sm:text-[0.8rem] mt-0.5 sm:mt-1">
                            Reg. No: {player.reg_number} • {player.department_branch} • {player.batch_name || ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Button
                          type="button"
                          onClick={(e) => {
                            if (isOperationDisabled) {
                              onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                              return
                            }
                            handleEditClick(e, player)
                          }}
                          disabled={isOperationDisabled}
                          title={isOperationDisabled ? operationStatus.reason : ''}
                          variant="secondary"
                          className="px-2 py-0.5 sm:px-3 sm:py-1 text-[0.7rem] sm:text-[0.8rem]"
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          onClick={(e) => {
                            if (isOperationDisabled) {
                              onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                              return
                            }
                            handleDeleteClick(e, player)
                          }}
                          disabled={isOperationDisabled}
                          title={isOperationDisabled ? operationStatus.reason : ''}
                          variant="danger"
                          className="px-2 py-0.5 sm:px-3 sm:py-1 text-[0.7rem] sm:text-[0.8rem]"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      <div className="text-[#cbd5ff] text-[0.75rem] sm:text-[0.85rem] mb-2 sm:mb-3 font-semibold">
                        Editing: {player.full_name} ({player.reg_number})
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                        <Input
                          label="Full Name"
                          value={editedData.full_name || ''}
                          onChange={(e) => handleFieldChange('full_name', e.target.value)}
                          required
                        />

                        <Input
                          label="Gender"
                          type="select"
                          value={editedData.gender || ''}
                          onChange={(e) => handleFieldChange('gender', e.target.value)}
                          disabled={true}
                          options={GENDER_OPTIONS.filter(opt => opt.value !== '')}
                          required
                        />

                        <Input
                          label="Department/Branch"
                          type="select"
                          value={editedData.department_branch || ''}
                          onChange={(e) => handleFieldChange('department_branch', e.target.value)}
                          options={loadingDepartments ? [{ value: '', label: 'Loading...' }] : departmentOptions.filter(opt => opt.value !== '')}
                          disabled={loadingDepartments}
                          required
                        />

                        <Input
                          label="Batch"
                          type="text"
                          value={editedData.batch_name || 'N/A'}
                          disabled={true}
                          placeholder="Batch name (cannot be modified)"
                          required
                        />

                        <Input
                          label="Mobile Number"
                          type="tel"
                          value={editedData.mobile_number || ''}
                          onChange={(e) => handleFieldChange('mobile_number', e.target.value)}
                          required
                        />

                        <Input
                          label="Email ID"
                          type="email"
                          value={editedData.email_id || ''}
                          onChange={(e) => handleFieldChange('email_id', e.target.value)}
                          required
                        />
                      </div>

                      <div className="flex gap-2 mt-3 sm:mt-4 mb-4 justify-center">
                        <Button
                          type="button"
                          onClick={() => {
                            if (isOperationDisabled) {
                              onStatusPopup(`❌ ${operationStatus.reason}`, 'error', 4000)
                              return
                            }
                            handleSavePlayer()
                          }}
                          disabled={saving || isOperationDisabled}
                          loading={saving}
                          title={isOperationDisabled ? operationStatus.reason : ''}
                          className="px-3 py-1.5 sm:px-4 sm:py-2 text-[0.75rem] sm:text-[0.85rem] font-semibold rounded-[8px]"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={saving}
                          variant="secondary"
                          className="px-3 py-1.5 sm:px-4 sm:py-2 text-[0.75rem] sm:text-[0.85rem] font-semibold rounded-[8px]"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        onConfirm={
          playerEnrollments.teams.length > 0 || playerEnrollments.hasMatches
            ? handleDeleteCancel
            : handleDeleteConfirm
        }
        title={
          playerEnrollments.teams.length > 0 || playerEnrollments.hasMatches
            ? 'Cannot Delete Player'
            : 'Delete Player'
        }
        confirmText={
          playerEnrollments.teams.length > 0 || playerEnrollments.hasMatches
            ? 'Close'
            : 'Delete'
        }
        cancelText="Cancel"
        variant={
          playerEnrollments.teams.length > 0 || playerEnrollments.hasMatches
            ? 'secondary'
            : 'danger'
        }
        loading={deleting || loadingEnrollments}
        embedded={true}
        message={
          loadingEnrollments ? (
            <div className="text-center">
              <LoadingSpinner message="Loading player enrollments..." />
            </div>
          ) : playerEnrollments.hasMatches && playerEnrollments.matches.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[#ef4444] font-semibold">
                Cannot delete player. Player has match(es) (any status):
              </p>
              <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                <ul className="space-y-2">
                  {playerEnrollments.matches.map((match, index) => (
                    <li key={index} className="text-[#e5e7eb] text-sm">
                      • <span className="font-semibold">{match.sport}</span> - Match #{match.match_number} ({match.match_type})
                      <span className="text-[#ffe66d] ml-2">[{match.status}]</span>
                      {match.match_date && (
                        <span className="text-[#cbd5ff] ml-2">
                          - {new Date(match.match_date).toLocaleDateString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[#cbd5ff] text-sm">
                Player cannot be deleted if they have any match history (scheduled/completed/draw/cancelled).
              </p>
            </div>
          ) : playerEnrollments.teams.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[#ef4444] font-semibold">
                Cannot delete player. Player is a member of the following team(s):
              </p>
              <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                <ul className="space-y-2">
                  {playerEnrollments.teams.map((team, index) => (
                    <li key={index} className="text-[#e5e7eb] text-sm">
                      • <span className="font-semibold">{team.sport}</span> - {team.team_name}
                      {team.is_captain && <span className="text-[#ffe66d] ml-2">(Captain)</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[#cbd5ff] text-sm">
                Please remove the player from all teams before deleting.
              </p>
            </div>
          ) : playerEnrollments.nonTeamEvents.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[#e5e7eb]">
                Are you sure you want to delete <span className="font-semibold text-[#ffe66d]">{playerToDelete?.full_name}</span>?
              </p>
              <p className="text-[#cbd5ff] text-sm">
                This will also remove the player from the following event(s):
              </p>
              <div className="bg-[rgba(255,230,109,0.1)] border border-[rgba(255,230,109,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                <ul className="space-y-2">
                  {playerEnrollments.nonTeamEvents.map((event, index) => (
                    <li key={index} className="text-[#e5e7eb] text-sm">
                      • <span className="font-semibold">{event.sport}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[#ef4444] text-sm font-semibold">
                This action cannot be undone.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[#e5e7eb]">
                Are you sure you want to delete <span className="font-semibold text-[#ffe66d]">{playerToDelete?.full_name}</span>?
              </p>
              <p className="text-[#ef4444] text-sm font-semibold">
                This action cannot be undone.
              </p>
            </div>
          )
        }
      />

      {/* Bulk Delete Confirmation Dialog */}
      {(() => {
        // Check enrollments from state to determine if any players have teams or matches
        const playersWithTeams = []
        const playersWithMatches = []
        const playersToDelete = []
        
        if (!loadingBulkEnrollments && Object.keys(bulkDeleteEnrollments).length > 0) {
          for (const regNumber of Array.from(selectedPlayers)) {
            const enrollments = bulkDeleteEnrollments[regNumber]
            if (enrollments && !enrollments.error) {
              if (enrollments.teams && enrollments.teams.length > 0) {
                playersWithTeams.push({
                  reg_number: regNumber,
                  full_name: enrollments.player?.full_name || regNumber,
                  teams: enrollments.teams
                })
              } else if (enrollments.hasMatches && enrollments.matches && enrollments.matches.length > 0) {
                playersWithMatches.push({
                  reg_number: regNumber,
                  full_name: enrollments.player?.full_name || regNumber,
                  matches: enrollments.matches
                })
              } else {
                // Player can be deleted
                playersToDelete.push({
                  reg_number: regNumber,
                  full_name: enrollments.player?.full_name || regNumber,
                  nonTeamEvents: enrollments.nonTeamEvents || []
                })
              }
            }
          }
        }
        
        const hasValidationErrors = playersWithTeams.length > 0 || playersWithMatches.length > 0
        const hasApiErrors = bulkDeleteError && (bulkDeleteError.playersWithTeams || bulkDeleteError.playersWithMatches || bulkDeleteError.message?.includes('registration period') || bulkDeleteError.message?.includes('only allowed during'))
        const cannotDelete = hasValidationErrors || hasApiErrors
        
        return (
          <ConfirmationDialog
            isOpen={bulkDeleteConfirmOpen}
            onClose={handleBulkDeleteCancel}
            onConfirm={cannotDelete ? handleBulkDeleteCancel : handleBulkDeleteConfirm}
            title={cannotDelete ? 'Cannot Delete Players' : 'Delete Selected Players'}
            confirmText={cannotDelete ? 'Close' : 'Delete'}
            cancelText="Cancel"
            variant={cannotDelete ? 'secondary' : 'danger'}
            loading={bulkDeleting || loadingBulkEnrollments}
            embedded={true}
            message={
              loadingBulkEnrollments ? (
                <div className="text-center">
                  <LoadingSpinner message="Loading player enrollments..." />
                </div>
              ) : hasApiErrors ? (
            // Show API errors (registration period, etc.) or validation errors from API response
            <div className="space-y-4">
              <p className="text-[#ef4444] font-semibold">
                {bulkDeleteError.message || 'Cannot delete players'}
              </p>
              
              {bulkDeleteError.playersWithTeams && bulkDeleteError.playersWithTeams.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[#ef4444] font-semibold text-sm">
                    Players with team memberships ({bulkDeleteError.playersWithTeams.length}):
                  </p>
                  <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                    <ul className="space-y-2">
                      {bulkDeleteError.playersWithTeams.map((player, index) => (
                        <li key={index} className="text-[#e5e7eb] text-sm">
                          • <span className="font-semibold">{player.full_name}</span> ({player.reg_number})
                          <div className="ml-4 mt-1">
                            {player.teams.map((team, teamIndex) => (
                              <div key={teamIndex} className="text-[#cbd5ff] text-xs">
                                - {team.sport}: {team.team_name}
                                {team.is_captain && <span className="text-[#ffe66d] ml-1">(Captain)</span>}
                              </div>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[#cbd5ff] text-xs">
                    Please remove these players from all teams before deleting.
                  </p>
                </div>
              )}

              {bulkDeleteError.playersWithMatches && bulkDeleteError.playersWithMatches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[#ef4444] font-semibold text-sm">
                    Players with match history ({bulkDeleteError.playersWithMatches.length}):
                  </p>
                  <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                    <ul className="space-y-2">
                      {bulkDeleteError.playersWithMatches.map((player, index) => (
                        <li key={index} className="text-[#e5e7eb] text-sm">
                          • <span className="font-semibold">{player.full_name}</span> ({player.reg_number})
                          <div className="ml-4 mt-1">
                            {player.matches.slice(0, 3).map((match, matchIndex) => (
                              <div key={matchIndex} className="text-[#cbd5ff] text-xs">
                                - {match.sport} - Match #{match.match_number} ({match.match_type})
                                <span className="text-[#ffe66d] ml-1">[{match.status}]</span>
                                {match.match_date && (
                                  <span className="text-[#cbd5ff] ml-1">
                                    - {new Date(match.match_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ))}
                            {player.matches.length > 3 && (
                              <div className="text-[#cbd5ff] text-xs italic">
                                ... and {player.matches.length - 3} more match(es)
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[#cbd5ff] text-xs">
                    Players cannot be deleted if they have any match history (scheduled/completed/draw/cancelled).
                  </p>
                </div>
              )}
            </div>
          ) : hasValidationErrors ? (
                <div className="space-y-4">
                  <p className="text-[#ef4444] font-semibold">
                    Cannot delete some players. The following players have constraints:
                  </p>
                  
                  {playersWithTeams.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[#ef4444] font-semibold text-sm">
                        Players with team memberships ({playersWithTeams.length}):
                      </p>
                      <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                        <ul className="space-y-2">
                          {playersWithTeams.map((player, index) => (
                            <li key={index} className="text-[#e5e7eb] text-sm">
                              • <span className="font-semibold">{player.full_name}</span> ({player.reg_number})
                              <div className="ml-4 mt-1">
                                {player.teams.map((team, teamIndex) => (
                                  <div key={teamIndex} className="text-[#cbd5ff] text-xs">
                                    - {team.sport}: {team.team_name}
                                    {team.is_captain && <span className="text-[#ffe66d] ml-1">(Captain)</span>}
                                  </div>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-[#cbd5ff] text-xs">
                        Please remove these players from all teams before deleting.
                      </p>
                    </div>
                  )}

                  {playersWithMatches.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[#ef4444] font-semibold text-sm">
                        Players with match history ({playersWithMatches.length}):
                      </p>
                      <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                        <ul className="space-y-2">
                          {playersWithMatches.map((player, index) => (
                            <li key={index} className="text-[#e5e7eb] text-sm">
                              • <span className="font-semibold">{player.full_name}</span> ({player.reg_number})
                              <div className="ml-4 mt-1">
                                {player.matches.slice(0, 3).map((match, matchIndex) => (
                                  <div key={matchIndex} className="text-[#cbd5ff] text-xs">
                                    - {match.sport} - Match #{match.match_number} ({match.match_type})
                                    <span className="text-[#ffe66d] ml-1">[{match.status}]</span>
                                    {match.match_date && (
                                      <span className="text-[#cbd5ff] ml-1">
                                        - {new Date(match.match_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {player.matches.length > 3 && (
                                  <div className="text-[#cbd5ff] text-xs italic">
                                    ... and {player.matches.length - 3} more match(es)
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-[#cbd5ff] text-xs">
                        Players cannot be deleted if they have any match history (scheduled/completed/draw/cancelled).
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                // All players can be deleted - show confirmation with event details
                (() => {
                  const allNonTeamEvents = new Set()
                  playersToDelete.forEach(player => {
                    player.nonTeamEvents.forEach(event => {
                      allNonTeamEvents.add(event.sport)
                    })
                  })
                  
                  return (
                    <div className="space-y-3">
                      <p className="text-[#e5e7eb]">
                        Are you sure you want to delete <span className="font-semibold text-[#ffe66d]">{selectedPlayers.size}</span> selected player(s)?
                      </p>
                      {allNonTeamEvents.size > 0 && (
                        <>
                          <p className="text-[#cbd5ff] text-sm">
                            This will also remove players from the following event(s):
                          </p>
                          <div className="bg-[rgba(255,230,109,0.1)] border border-[rgba(255,230,109,0.3)] rounded-[8px] p-3 max-h-[200px] overflow-y-auto">
                            <ul className="space-y-2">
                              {Array.from(allNonTeamEvents).map((sport, index) => (
                                <li key={index} className="text-[#e5e7eb] text-sm">
                                  • <span className="font-semibold">{sport}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                      <p className="text-[#ef4444] text-sm font-semibold">
                        This action cannot be undone.
                      </p>
                    </div>
                  )
                })()
              )
            }
          />
        )
      })()}
    </Modal>
  )
}

export default PlayerListModal

