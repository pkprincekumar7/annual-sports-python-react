function StatusPopup({ popup }) {
  if (!popup.show) return null

  const baseClasses =
    'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[260px] max-w-[90%] px-[1.4rem] py-4 rounded-xl text-[0.95rem] text-center shadow-[0_18px_40px_rgba(0,0,0,0.8)] z-[300]'
  const successClasses = 'bg-[rgba(15,23,42,0.98)] text-[#bbf7d0] border border-[rgba(34,197,94,0.8)]'
  const errorClasses = 'bg-[rgba(15,23,42,0.98)] text-[#fecaca] border border-[rgba(248,113,113,0.9)]'

  return (
    <div className={`${baseClasses} ${popup.type === 'success' ? successClasses : errorClasses}`}>
      {popup.message}
    </div>
  )
}

export default StatusPopup

