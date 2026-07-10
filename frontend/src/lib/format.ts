/** Small formatting helpers used across the UI. */

/** "Just now", "5m ago", "3h ago", "2d ago", or a date for older items. */
export function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  const sec = Math.round(diff / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)

  if (sec < 45) return 'Just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 7) return `${day}d ago`
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Human-readable file size, e.g. 1.4 MB. */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

/** Initials from a full name, e.g. "Darnell Howe" -> "DH". */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** True for MIME types we can render as an inline image preview. */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}
