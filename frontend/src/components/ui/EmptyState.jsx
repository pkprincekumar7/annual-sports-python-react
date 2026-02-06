/**
 * Reusable Empty State Component
 */

function EmptyState({ message, className = '' }) {
  return (
    <div className={`text-center py-8 text-[#a5b4fc] ${className}`}>
      {message}
    </div>
  )
}

export default EmptyState

