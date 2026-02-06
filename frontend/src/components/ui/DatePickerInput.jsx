/**
 * DatePickerInput Component
 * Reusable date input with auto-close functionality
 * Closes datepicker after date selection
 */

import { useRef, useEffect } from 'react'
import Input from './Input'

function DatePickerInput({
  label,
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  min,
  max,
  ...props
}) {
  const previousValueRef = useRef(value || '')
  const closeTimeoutRef = useRef(null)

  // Update previous value when value prop changes from outside
  useEffect(() => {
    previousValueRef.current = value || ''
  }, [value])

  const handleChange = (e) => {
    const newValue = e.target.value || ''
    const previousValue = previousValueRef.current
    
    // Extract date part from value (format: YYYY-MM-DD)
    const extractDatePart = (val) => {
      if (!val) return null
      // Handle both date format (YYYY-MM-DD) and datetime format (YYYY-MM-DDTHH:mm)
      const match = val.match(/^(\d{4}-\d{2}-\d{2})/)
      return match ? match[1] : null
    }
    
    const newDatePart = extractDatePart(newValue)
    const previousDatePart = extractDatePart(previousValue)
    
    // Normalize value to date-only format (YYYY-MM-DD)
    // If value is in datetime format, extract just the date part
    let normalizedValue = newValue
    if (newValue.includes('T')) {
      normalizedValue = newDatePart || ''
    }
    
    // Create a synthetic event with the normalized value
    const syntheticEvent = {
      ...e,
      target: {
        ...e.target,
        value: normalizedValue
      }
    }
    
    // Call the parent onChange handler with the normalized value
    if (onChange) {
      onChange(syntheticEvent)
    }
    
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    
    // Close datepicker if date was actually selected (changed from previous)
    if (newDatePart && newDatePart !== previousDatePart) {
      closeTimeoutRef.current = setTimeout(() => {
        const inputElement = e.target || (id ? document.getElementById(id) : null)
        if (inputElement) {
          // Double-check the date part is still different before closing
          const currentValue = inputElement.value || ''
          const currentDatePart = extractDatePart(currentValue)
          if (currentDatePart && currentDatePart !== previousDatePart) {
            // Force blur to close the datepicker
            inputElement.blur()
          }
        }
        closeTimeoutRef.current = null
      }, 150)
    }
    
    previousValueRef.current = normalizedValue
  }

  // Normalize min/max to date format if they're in datetime format
  const normalizeDateValue = (val) => {
    if (!val) return val
    if (typeof val === 'string' && val.includes('T')) {
      const match = val.match(/^(\d{4}-\d{2}-\d{2})/)
      return match ? match[1] : val
    }
    if (val instanceof Date) {
      const year = val.getFullYear()
      const month = String(val.getMonth() + 1).padStart(2, '0')
      const day = String(val.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return val
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  // Normalize value to date format (YYYY-MM-DD)
  const normalizedValue = value ? (value.includes('T') ? value.split('T')[0] : value) : value
  const normalizedMin = min ? normalizeDateValue(min) : min
  const normalizedMax = max ? normalizeDateValue(max) : max

  return (
    <Input
      label={label}
      id={id}
      name={name}
      type="date"
      value={normalizedValue}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      className={className}
      min={normalizedMin}
      max={normalizedMax}
      {...props}
    />
  )
}

export default DatePickerInput

