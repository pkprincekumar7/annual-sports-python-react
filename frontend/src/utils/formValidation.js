/**
 * Form Validation Utilities
 * Reusable validation functions for forms
 */

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email?.trim() || '')
}

/**
 * Validate phone number (10 digits)
 */
export const validatePhone = (phone) => {
  const phoneRegex = /^[0-9]{10}$/
  return phoneRegex.test(phone?.trim() || '')
}

/**
 * Validate password (non-empty)
 */
export const validatePassword = (password) => {
  return typeof password === 'string' && password.trim().length > 0
}

/**
 * Validate required fields
 */
export const validateRequired = (fields) => {
  const errors = []
  
  for (const [field, value] of Object.entries(fields)) {
    if (!value || (typeof value === 'string' && !value.trim())) {
      errors.push(`${field.replace(/_/g, ' ')} is required`)
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Validate player form data
 */
export const validatePlayerForm = (data) => {
  const errors = []

  // Required fields
  const requiredFields = {
    'Registration number': data.reg_number,
    'Full name': data.full_name,
    'Gender': data.gender,
    'Department/Branch': data.department_branch,
    'Batch': data.batch_name,
    'Mobile number': data.mobile_number,
    'Email ID': data.email_id,
    'Password': data.password,
  }

  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value || (typeof value === 'string' && !value.trim())) {
      errors.push(`${field} is required`)
    }
  }

  // Email validation
  if (data.email_id && !validateEmail(data.email_id)) {
    errors.push('Invalid email format')
  }

  // Phone validation
  if (data.mobile_number && !validatePhone(data.mobile_number)) {
    errors.push('Invalid mobile number. Must be 10 digits.')
  }

  // Password validation
  if (data.password !== undefined && !validatePassword(data.password)) {
    errors.push('Password is required')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Trim form data
 */
export const trimFormData = (data) => {
  const trimmed = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      trimmed[key] = value.trim()
    } else {
      trimmed[key] = value
    }
  }
  return trimmed
}

