/**
 * IST (Asia/Kolkata, UTC+5:30) date helpers.
 * Calendar dates from the admin UI are interpreted in IST, not the browser local zone.
 */

export const IST_OFFSET = '+05:30'

const HAS_TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Parse an API date value into a Date.
 * Datetime strings without an offset are treated as UTC (the backend stores UTC),
 * never as the browser's local time.
 */
export function parseApiDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00${IST_OFFSET}`)
  }
  if (text.includes('T') && !HAS_TZ_SUFFIX.test(text)) {
    return new Date(`${text}Z`)
  }
  return new Date(text)
}

/** Current calendar year in IST */
export function currentIstYear() {
  return Number(todayIstDateString().slice(0, 4))
}

/** YYYY-MM-DD → ISO instant: start of that calendar day in IST */
export function startOfIstDay(dateStr) {
  if (!dateStr) return null
  const d = String(dateStr).slice(0, 10)
  return new Date(`${d}T00:00:00${IST_OFFSET}`).toISOString()
}

/** YYYY-MM-DD → ISO instant: end of that calendar day in IST */
export function endOfIstDay(dateStr) {
  if (!dateStr) return null
  const d = String(dateStr).slice(0, 10)
  return new Date(`${d}T23:59:59.999${IST_OFFSET}`).toISOString()
}

/** Today's calendar date in IST (YYYY-MM-DD) */
export function todayIstDateString() {
  return toIstDateString(new Date())
}

/** Parse stored ISO / Date and return YYYY-MM-DD in IST */
export function toIstDateString(value) {
  if (!value) return ''
  const date = parseApiDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return y && m && d ? `${y}-${m}-${d}` : ''
}

/** Midnight today in IST as a Date (UTC instant) */
export function nowIstMidnight() {
  const today = toIstDateString(new Date())
  return new Date(`${today}T00:00:00${IST_OFFSET}`)
}

/** Boundaries for an API-stored date field (start/end of its IST calendar day) */
export function boundsForStoredDate(value, isEnd = false) {
  const day = toIstDateString(value)
  if (!day) return null
  return new Date(isEnd ? endOfIstDay(day) : startOfIstDay(day))
}

export function compareIstDays(left, right) {
  const a = toIstDateString(left)
  const b = toIstDateString(right)
  if (!a || !b) return 0
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Format for display using IST calendar (e.g. "20th Nov 2026") */
export function formatDateIst(value) {
  const date = parseApiDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  const day = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(date)
  )
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short' }).format(date)
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(date)
  return `${ordinalDay(day)} ${month} ${year}`
}

function ordinalDay(day) {
  const j = day % 10
  const k = day % 100
  if (j === 1 && k !== 11) return `${day}st`
  if (j === 2 && k !== 12) return `${day}nd`
  if (j === 3 && k !== 13) return `${day}rd`
  return `${day}th`
}
