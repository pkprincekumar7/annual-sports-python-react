/**
 * Reusable Error Message Component
 */

function ErrorMessage({ message, className = '' }) {
  if (!message) return null

  return (
    <div className={`text-center py-8 text-red-400 ${className}`}>
      {message}
    </div>
  )
}

export default ErrorMessage

