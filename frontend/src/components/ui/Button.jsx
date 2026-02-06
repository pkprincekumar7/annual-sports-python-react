/**
 * Reusable Button Component
 * Standardized button styles across the application
 */

function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  fullWidth = false,
  ...props
}) {
  const baseClasses = `
    rounded-full 
    px-6 
    py-[9px] 
    text-[0.9rem] 
    font-bold 
    uppercase 
    tracking-[0.1em] 
    cursor-pointer 
    transition-all 
    duration-[0.12s] 
    ease-in-out 
    disabled:opacity-50 
    disabled:cursor-not-allowed 
    disabled:hover:translate-y-0
    ${fullWidth ? 'flex-1' : ''}
    ${className}
  `

  const variantClasses = {
    primary: `
      border-none 
      bg-gradient-to-r from-[#ffe66d] to-[#ff9f1c] 
      text-[#111827] 
      shadow-[0_10px_24px_rgba(250,204,21,0.6)] 
      hover:-translate-y-0.5 
      hover:shadow-[0_16px_36px_rgba(250,204,21,0.75)]
    `,
    secondary: `
      border border-[rgba(148,163,184,0.7)] 
      bg-[rgba(15,23,42,0.95)] 
      text-[#e5e7eb] 
      hover:-translate-y-0.5 
      hover:shadow-[0_10px_26px_rgba(15,23,42,0.9)]
    `,
    danger: `
      border-none 
      bg-gradient-to-r from-[#ef4444] to-[#dc2626] 
      text-white 
      shadow-[0_10px_24px_rgba(239,68,68,0.6)] 
      hover:-translate-y-0.5 
      hover:shadow-[0_16px_36px_rgba(239,68,68,0.75)]
    `,
    success: `
      border-none 
      bg-gradient-to-r from-[#22c55e] to-[#16a34a] 
      text-white 
      shadow-[0_10px_24px_rgba(34,197,94,0.6)] 
      hover:-translate-y-0.5 
      hover:shadow-[0_16px_36px_rgba(34,197,94,0.75)]
    `,
    ghost: `
      border-none 
      bg-transparent 
      text-[#e5e7eb] 
      hover:text-[#ffe66d]
    `,
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.primary}`}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}

export default Button

