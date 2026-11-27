export function formatBytes (bytes: number): string {
  if (!bytes || bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  const pretty = i === 0 ? String(Math.round(value)) : value >= 100 ? value.toFixed(0) : value.toFixed(1)
  return `${pretty} ${units[i]}`
}

export function relativeTime (timestamp?: number): string {
  if (!timestamp) return 'Never opened'
  const diff = Date.now() - timestamp
  if (diff < 45_000) return 'Just now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function greeting (): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function initials (name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] || '?').slice(0, 2).toUpperCase()
}

export function monogramTint (name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360
  const hue = (hash * 1.7) % 360
  return `linear-gradient(145deg, hsl(${hue} 78% 64%), hsl(${(hue + 48) % 360} 74% 42%))`
}

export function iconUrl (iconFile?: string | null, version = 0): string | null {
  if (!iconFile) return null
  return `glassicon://icon/${encodeURIComponent(iconFile)}?v=${version}`
}

export function plural (count: number, word: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? word : pluralWord || word + 's'}`
}
