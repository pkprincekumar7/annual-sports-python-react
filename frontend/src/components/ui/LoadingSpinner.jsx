/**
 * Reusable Loading Spinner Component
 */

function LoadingSpinner({ message = 'Loading...', className = '' }) {
  return (
    <div className={`text-center py-8 text-[#a5b4fc] ${className}`}>
      {message}
    </div>
  )
}

export default LoadingSpinner

