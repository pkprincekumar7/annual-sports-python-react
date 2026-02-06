/**
 * Reusable Input Component
 * Standardized input/select styling
 */

function Input({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  options = null, // For select inputs
  children, // For custom select options
  ...props
}) {
  const inputClasses = `
    px-[10px] 
    py-2 
    rounded-[10px] 
    border border-[rgba(148,163,184,0.6)] 
    bg-[rgba(15,23,42,0.9)] 
    text-[#e2e8f0] 
    text-[0.9rem] 
    outline-none 
    transition-all 
    duration-[0.15s] 
    ease-in-out 
    focus:border-[#ffe66d] 
    focus:shadow-[0_0_0_1px_rgba(255,230,109,0.55),0_0_16px_rgba(248,250,252,0.2)] 
    focus:-translate-y-[1px]
    disabled:opacity-50 
    disabled:cursor-not-allowed
    ${className}
  `

  return (
    <div className="flex flex-col mb-[0.7rem]">
      {label && (
        <label 
          htmlFor={id} 
          className="text-[0.78rem] uppercase text-[#cbd5ff] mb-1 tracking-[0.06em]"
        >
          {label} {required && '*'}
        </label>
      )}
      
      {type === 'select' || options ? (
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={inputClasses}
          {...props}
        >
          {options ? (
            <>
              <option value="">Select {label?.toLowerCase() || 'option'}</option>
              {options.map((option) => (
                <option key={option.value || option} value={option.value || option}>
                  {option.label || option}
                </option>
              ))}
            </>
          ) : (
            children
          )}
        </select>
      ) : (
        <input
          type={type}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={inputClasses}
          {...props}
        />
      )}
    </div>
  )
}

export default Input

