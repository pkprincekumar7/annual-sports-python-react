/**
 * Custom hook to fetch departments
 * Fetches all departments for dropdowns
 * Note: Departments are not year-dependent
 */

import { useState, useEffect } from 'react'
import { fetchWithAuth } from '../utils/api'
import logger from '../utils/logger'

export function useDepartments() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchDepartments = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetchWithAuth('/departments')
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        // Handle both array response and object response formats
        const departmentsList = Array.isArray(data) 
          ? data 
          : (data.success ? (data.departments || []) : [])
        
        const deptOptions = departmentsList.map(dept => ({
          value: dept.name,
          label: dept.name
        }))
        setDepartments(deptOptions)
      } catch (err) {
        logger.error('Error fetching departments:', err)
        setError(err.message || 'Failed to fetch departments')
        // Fallback to empty array on error
        setDepartments([])
      } finally {
        setLoading(false)
      }
    }

    fetchDepartments()
  }, [])

  return { departments, loading, error }
}

