/**
 * Participant Validation Utilities
 * Centralized validation logic for participant selection and matching
 */

/**
 * Validate that all participants have the same gender
 * @param {Array} participants - Array of participant objects with gender property
 * @param {string} expectedGender - Expected gender (optional, will use first participant's gender if not provided)
 * @returns {Object} { isValid: boolean, error: string|null, mismatches: Array }
 */
export function validateGenderMatch(participants, expectedGender = null) {
  if (!participants || participants.length === 0) {
    return { isValid: true, error: null, mismatches: [] }
  }

  const firstGender = expectedGender || participants[0]?.gender
  if (!firstGender) {
    return { isValid: false, error: 'Could not determine gender for participants', mismatches: [] }
  }

  const mismatches = participants.filter(p => p.gender && p.gender !== firstGender)
  
  if (mismatches.length > 0) {
    const mismatchNames = mismatches.map(p => 
      p.full_name ? `${p.full_name} (${p.reg_number || ''})` : (p.reg_number || 'Unknown')
    ).join(', ')
    
    return {
      isValid: false,
      error: `Gender mismatch: ${mismatchNames} must have the same gender (${firstGender}) as other participants.`,
      mismatches
    }
  }

  return { isValid: true, error: null, mismatches: [] }
}

/**
 * Validate that all participants have the same batch
 * @param {Array} participants - Array of participant objects with batch_name property
 * @param {string} expectedBatch - Expected batch name (optional, will use first participant's batch_name if not provided)
 * @returns {Object} { isValid: boolean, error: string|null, mismatches: Array }
 */
export function validateBatchMatch(participants, expectedBatch = null) {
  if (!participants || participants.length === 0) {
    return { isValid: true, error: null, mismatches: [] }
  }

  const firstBatch = expectedBatch || participants[0]?.batch_name
  if (!firstBatch) {
    return { isValid: false, error: 'Could not determine batch for participants', mismatches: [] }
  }

  const mismatches = participants.filter(p => p.batch_name && p.batch_name !== firstBatch)
  
  if (mismatches.length > 0) {
    const mismatchNames = mismatches.map(p => 
      p.full_name ? `${p.full_name} (${p.reg_number || ''})` : (p.reg_number || 'Unknown')
    ).join(', ')
    
    return {
      isValid: false,
      error: `Batch mismatch: ${mismatchNames} must be in the same batch (${firstBatch}) as other participants.`,
      mismatches
    }
  }

  return { isValid: true, error: null, mismatches: [] }
}

/**
 * Validate that there are no duplicate participants
 * @param {Array} participantIds - Array of participant IDs (reg_number, team_name, etc.)
 * @param {Array} participantList - Array of participant objects (optional, for error messages)
 * @returns {Object} { isValid: boolean, error: string|null, duplicates: Array }
 */
export function validateNoDuplicates(participantIds, participantList = []) {
  if (!participantIds || participantIds.length === 0) {
    return { isValid: true, error: null, duplicates: [] }
  }

  const seen = new Set()
  const duplicates = []

  for (const id of participantIds) {
    if (!id) continue // Skip empty values
    
    if (seen.has(id)) {
      // Find participant name for better error message
      const participant = participantList.find(p => 
        (p.reg_number === id) || (p.team_name === id) || (p.full_name === id)
      )
      duplicates.push(participant?.full_name || participant?.team_name || id)
    } else {
      seen.add(id)
    }
  }

  if (duplicates.length > 0) {
    return {
      isValid: false,
      error: `Duplicate participants selected: ${duplicates.join(', ')}. Each participant can only be selected once.`,
      duplicates
    }
  }

  return { isValid: true, error: null, duplicates: [] }
}

/**
 * Validate that all participant IDs exist in the available list
 * @param {Array} participantIds - Array of participant IDs to validate
 * @param {Array} availableParticipants - Array of available participant objects
 * @param {string} idField - Field name to use for ID comparison ('reg_number', 'team_name', etc.)
 * @returns {Object} { isValid: boolean, error: string|null, invalid: Array }
 */
export function validateParticipantsExist(participantIds, availableParticipants, idField = 'reg_number') {
  if (!participantIds || participantIds.length === 0) {
    return { isValid: true, error: null, invalid: [] }
  }

  const availableIds = new Set(availableParticipants.map(p => p[idField]))
  const invalid = participantIds.filter(id => id && !availableIds.has(id))

  if (invalid.length > 0) {
    return {
      isValid: false,
      error: `Invalid participant(s): ${invalid.join(', ')}. Please select from available participants.`,
      invalid
    }
  }

  return { isValid: true, error: null, invalid: [] }
}

/**
 * Validate that required number of participants are selected
 * @param {Array} participantIds - Array of participant IDs
 * @param {number} requiredCount - Required number of participants
 * @param {string} participantType - Type of participant ('players', 'teams', etc.) for error message
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export function validateParticipantCount(participantIds, requiredCount, participantType = 'participants') {
  if (!participantIds) {
    return { isValid: false, error: `Please select ${requiredCount} ${participantType}.` }
  }

  const validIds = participantIds.filter(id => id)
  
  if (validIds.length !== requiredCount) {
    return {
      isValid: false,
      error: `Please select all ${requiredCount} ${participantType}.`
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate that two participants are different
 * @param {string} participant1 - First participant ID
 * @param {string} participant2 - Second participant ID
 * @param {string} participantType - Type of participant ('players', 'teams', etc.) for error message
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export function validateDifferentParticipants(participant1, participant2, participantType = 'participants') {
  if (!participant1 || !participant2) {
    return { isValid: false, error: `Please select both ${participantType}.` }
  }

  if (participant1 === participant2) {
    return { isValid: false, error: `Please select different ${participantType}.` }
  }

  return { isValid: true, error: null }
}

/**
 * Comprehensive validation for participant selection
 * @param {Object} options - Validation options
 * @param {Array} options.participantIds - Array of participant IDs
 * @param {Array} options.participantList - Array of participant objects (for gender/batch validation)
 * @param {Array} options.availableParticipants - Array of available participants
 * @param {number} options.requiredCount - Required number of participants
 * @param {string} options.participantType - Type of participant ('players', 'teams', etc.)
 * @param {string} options.idField - Field name for ID comparison
 * @param {string} options.expectedGender - Expected gender (optional)
 * @param {string|number} options.expectedYear - Expected year (optional)
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
export function validateParticipantSelection({
  participantIds,
  participantList = [],
  availableParticipants = [],
  requiredCount = null,
  participantType = 'participants',
  idField = 'reg_number',
  expectedGender = null,
  expectedBatch = null
}) {
  const errors = []

  // Validate count if required
  if (requiredCount !== null) {
    const countValidation = validateParticipantCount(participantIds, requiredCount, participantType)
    if (!countValidation.isValid) {
      errors.push(countValidation.error)
    }
  }

  // Validate no duplicates
  const duplicateValidation = validateNoDuplicates(participantIds, participantList)
  if (!duplicateValidation.isValid) {
    errors.push(duplicateValidation.error)
  }

  // Validate participants exist in available list
  if (availableParticipants.length > 0) {
    const existValidation = validateParticipantsExist(participantIds, availableParticipants, idField)
    if (!existValidation.isValid) {
      errors.push(existValidation.error)
    }
  }

  // Validate gender match if participant list provided
  if (participantList.length > 0) {
    const genderValidation = validateGenderMatch(participantList, expectedGender)
    if (!genderValidation.isValid) {
      errors.push(genderValidation.error)
    }
  }

  // Validate batch match if participant list provided
  if (participantList.length > 0) {
    const batchValidation = validateBatchMatch(participantList, expectedBatch)
    if (!batchValidation.isValid) {
      errors.push(batchValidation.error)
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

