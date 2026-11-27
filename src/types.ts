export type Theme = 'dark' | 'light' | 'auto'
export type Accent = 'blue' | 'violet' | 'pink' | 'teal' | 'green' | 'orange'
export type SortMode = 'name' | 'recent' | 'size'
export type ViewMode = 'grid' | 'list'

export type Settings = {
  folders: string[]
  theme: Theme
  accent: Accent
  sort: SortMode
  view: ViewMode
  reduceMotion: boolean
  ambientMotion: boolean
  extractFallback: boolean
  scanDepth: number
}

export type AppEntry = {
  id: string
  path: string
  name: string
  originalName?: string
  comment?: string
  genericName?: string
  categories: string[]
  category: string
  iconFile?: string | null
  customIconFile?: string | null
  size: number
  mtimeMs: number
  executable: boolean
  favorite: boolean
  customName?: string
  lastPlayed?: number
  launchCount: number
  running: boolean
  runningSince?: number
  version?: string
  source: 'scan' | 'manual'
  addedAt: number
  detailed?: boolean
}

export type FolderMeta = {
  path: string
  display: string
  exists: boolean
  count: number
}

export type Stats = {
  total: number
  favorites: number
  running: number
  size: number
}

export type AppState = {
  apps: AppEntry[]
  settings: Settings
  folders: FolderMeta[]
  stats: Stats
  version: string
  platform: string
  home: string
  scanning: boolean
}

export type ScanProgress = {
  phase: 'start' | 'enrich' | 'done'
  done?: number
  total?: number
  name?: string
}

export type ToastKind = 'info' | 'success' | 'error'

export type Toast = {
  id: string | number
  kind: ToastKind
  message: string
  detail?: string
  action?: { label: string; run: () => void }
}

export type LaunchFailure = {
  id: string
  name?: string
  code: string
  message: string
  fuse?: boolean
  log?: string
}

export type ApiResult = {
  ok: boolean
  code?: string
  message?: string
  state?: AppState
  pid?: number
}

export type Filter = 'all' | 'favorites' | 'running' | 'recent'
