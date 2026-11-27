import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, FolderPlus, LayoutGrid, List, Plus, RefreshCw, Search, Sparkles, X,
} from 'lucide-react'
import type {
  AppEntry, AppState, Filter, LaunchFailure, ScanProgress, Settings, SortMode, Toast, ViewMode,
} from './types'
import Background from './components/Background'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import { AppCard, AppRow } from './components/AppCard'
import DetailSheet from './components/DetailSheet'
import SettingsSheet from './components/SettingsSheet'
import Toasts from './components/Toasts'
import { IconButton, Segmented } from './components/ui'
import { formatBytes, greeting, plural } from './lib/format'

const api = window.glassdeck

export default function App () {
  const [state, setState] = useState<AppState | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [launching, setLaunching] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  )

  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimers = useRef(new Map<string | number, number>())
  const dragDepth = useRef(0)

  /* ---------------------------------------------------------------- */
  /* boot + subscriptions                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let alive = true

    api.getState().then((initial) => { if (alive) setState(initial) }).catch(() => {
      if (alive) notify('error', 'Could not reach the launcher backend')
    })

    const offState = api.onState((next) => setState(next))
    const offProgress = api.onProgress((update) => {
      setProgress(update)
      if (update.phase === 'done') {
        window.setTimeout(() => setProgress(null), 1200)
      }
    })
    const offToast = api.onToast((toast) => pushToast(toast))
    const offFail = api.onLaunchFailed((failure) => handleLaunchFailure(failure))
    const offMaximized = api.onMaximized(setMaximized)
    api.isMaximized().then(setMaximized).catch(() => {})

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mq.addEventListener('change', onScheme)

    return () => {
      alive = false
      offState()
      offProgress()
      offToast()
      offFail()
      offMaximized()
      mq.removeEventListener('change', onScheme)
      for (const timer of toastTimers.current.values()) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------------- */
  /* toasts                                                            */
  /* ---------------------------------------------------------------- */

  function dismissToast (id: string | number) {
    const timer = toastTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function pushToast (toast: Toast) {
    setToasts((current) => [...current.slice(-2), toast])
    const timer = window.setTimeout(() => dismissToast(toast.id), toast.action ? 9000 : 5200)
    toastTimers.current.set(toast.id, timer)
  }

  function notify (
    kind: Toast['kind'],
    message: string,
    detail?: string,
    action?: Toast['action'],
  ) {
    pushToast({ id: `local-${Date.now()}-${Math.random()}`, kind, message, detail, action })
  }

  function handleLaunchFailure (failure: LaunchFailure) {
    const app = state?.apps.find((candidate) => candidate.id === failure.id)
    const name = failure.name || app?.name || 'App'
    if (failure.fuse) {
      notify(
        'error',
        `${name} could not start (FUSE)`,
        failure.log || 'The AppImage runtime could not mount itself.',
        {
          label: 'Try extract mode',
          run: async () => {
            const result = await api.launch(failure.id, true)
            if (!result.ok) notify('error', result.message || 'Still could not launch')
          },
        },
      )
      return
    }
    notify('error', failure.message, failure.log?.split('\n').slice(-3).join('\n'))
  }

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  async function launch (app: AppEntry) {
    setLaunching((current) => [...current, app.id])
    window.setTimeout(() => {
      setLaunching((current) => current.filter((id) => id !== app.id))
    }, 1200)

    const result = await api.launch(app.id)
    if (result.ok) return

    if (result.code === 'NOT_EXECUTABLE') {
      notify(
        'error',
        `${app.name} is not executable`,
        'Linux blocks files without the execute bit. GlassDeck can fix it for you.',
        {
          label: 'Fix & launch',
          run: async () => {
            const fixed = await api.fixExecutable(app.id)
            if (fixed.ok) launch(app)
            else notify('error', fixed.message || 'Could not change permissions')
          },
        },
      )
      return
    }

    if (result.code === 'ALREADY_RUNNING') {
      notify('info', `${app.name} is already running`)
      return
    }

    notify('error', result.message || 'Could not launch this AppImage')
  }

  async function stop (app: AppEntry) {
    const result = await api.stop(app.id)
    if (!result.ok && result.code !== 'NOT_RUNNING') {
      notify('error', result.message || 'Could not stop the app')
    }
  }

  async function toggleFavorite (app: AppEntry) {
    const result = await api.favorite(app.id, !app.favorite)
    if (result.state) setState(result.state)
    if (!result.ok) notify('error', result.message || 'Could not update favorite')
  }

  async function rename (app: AppEntry, name: string) {
    const result = await api.rename(app.id, name)
    if (result.state) setState(result.state)
    if (!result.ok) notify('error', result.message || 'Could not rename')
  }

  async function remove (app: AppEntry) {
    const result = await api.remove(app.id)
    if (result.ok) {
      setSelectedId(null)
      notify('success', `${app.name} removed`, 'The AppImage itself is still on disk.')
    } else {
      notify('error', result.message || 'Could not remove')
    }
  }

  async function pickIcon (app: AppEntry) {
    const result = await api.pickIcon(app.id)
    if (result.ok) notify('success', 'Icon updated')
  }

  async function resetIcon (app: AppEntry) {
    const result = await api.resetIcon(app.id)
    if (result.ok) notify('info', 'Original icon restored')
  }

  async function refreshMeta (app: AppEntry) {
    const result = await api.refresh(app.id)
    if (result.ok) notify('success', 'Metadata re-read from the AppImage')
  }

  async function scan () {
    const result = await api.scan()
    if (result.state) setState(result.state)
    if (!result.ok) notify('error', result.message || 'Scan failed')
  }

  async function importApps () {
    const result = await api.importApps()
    if (result.ok) notify('success', 'AppImage added to your shelf')
  }

  async function addFolder () {
    const result = await api.addFolder()
    if (result.ok) notify('success', 'Folder added — scanning now')
  }

  async function removeFolder (folder: string) {
    const result = await api.removeFolder(folder)
    if (result.ok) notify('info', 'Folder removed from the scan list')
  }

  async function clearHidden () {
    const result = await api.clearHidden()
    if (result.ok) notify('success', 'Hidden apps restored')
  }

  async function updateSettings (patch: Partial<Settings>) {
    const result = await api.updateSettings(patch)
    if (result.state) setState(result.state)
    if (!result.ok) notify('error', result.message || 'Could not save settings')
  }

  /* ---------------------------------------------------------------- */
  /* drag & drop                                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files')

    const onDragOver = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = async (event: DragEvent) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files || [])
      const paths = files.map((file) => api.pathForFile(file)).filter(Boolean)
      if (!paths.length) return
      const result = await api.addPaths(paths)
      if (result.ok) {
        notify('success', paths.length === 1 ? 'AppImage added to your shelf' : `${paths.length} files checked`)
      } else if (result.message) {
        notify('error', result.message)
      }
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------------- */
  /* keyboard                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (mod && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        scan()
        return
      }
      if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (selectedId) setSelectedId(null)
        else if (document.activeElement === searchRef.current) {
          setQuery('')
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, selectedId])

  /* ---------------------------------------------------------------- */
  /* derived                                                           */
  /* ---------------------------------------------------------------- */

  const theme = state
    ? (state.settings.theme === 'auto' ? (systemDark ? 'dark' : 'light') : state.settings.theme)
    : 'dark'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = state?.settings.accent || 'blue'
  }, [theme, state?.settings.accent])

  const visibleApps = useMemo(() => {
    if (!state) return []
    const search = query.trim().toLowerCase()
    let list = state.apps.filter((app) => {
      if (!search) return true
      return [app.name, app.comment, app.category, app.path]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    })

    if (filter === 'favorites') list = list.filter((app) => app.favorite)
    else if (filter === 'running') list = list.filter((app) => app.running)
    else if (filter === 'recent') list = list.filter((app) => app.lastPlayed)

    const mode: SortMode = state.settings.sort
    return [...list].sort((a, b) => {
      if (mode === 'recent') return (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name)
      if (mode === 'size') return b.size - a.size || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })
  }, [state, query, filter])

  const selected = state?.apps.find((app) => app.id === selectedId) || null
  const scanningLabel = progress?.phase === 'enrich' && progress.total
    ? `Reading ${progress.done}/${progress.total}${progress.name ? ` · ${progress.name}` : ''}`
    : progress?.phase === 'start'
      ? 'Looking for AppImages…'
      : null

  if (!state) {
    return (
      <div className="app splash" data-theme="dark">
        <Background />
        <div className="splash-inner">
          <div className="splash-mark"><Sparkles size={26} /></div>
          <h1>GlassDeck</h1>
          <p>Warming up the glass…</p>
        </div>
      </div>
    )
  }

  const view: ViewMode = state.settings.view
  const total = state.stats.total

  return (
    <div
      className={`app ${selected || settingsOpen ? 'has-overlay' : ''}`}
      data-theme={theme}
      data-accent={state.settings.accent}
      data-motion={state.settings.reduceMotion ? 'off' : 'on'}
      data-ambient={state.settings.ambientMotion ? 'on' : 'off'}
      data-maximized={maximized}
      data-dragging={dragging || undefined}
    >
      <Background />
      <Titlebar />

      <div className="shell">
        <Sidebar
          state={state}
          filter={filter}
          onFilter={setFilter}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onOpenSettings={() => setSettingsOpen(true)}
          onImport={importApps}
          onScan={scan}
        />

        <main className="content">
          <header className="content-head">
            <div className="head-copy">
              <div className="eyebrow">
                Library
                {state.scanning && <span className="scan-pill"><span className="scan-dot" /> Scanning</span>}
              </div>
              <h1>{greeting()}</h1>
              <p className="head-sub">
                {scanningLabel || (
                  <>
                    {plural(total, 'AppImage')} · {formatBytes(state.stats.size)}
                    {state.stats.running > 0 && <> · <span className="live-text">{state.stats.running} running</span></>}
                  </>
                )}
              </p>
            </div>

            <div className="head-tools">
              <label className="search-pill">
                <Search size={15} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="Search your shelf"
                  onChange={(event) => setQuery(event.target.value)}
                  spellCheck={false}
                />
                {query
                  ? (
                    <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                      <X size={12} />
                    </button>
                    )
                  : <kbd className="search-kbd">Ctrl K</kbd>}
              </label>

              <div className="sort-pill" title="Sort">
                <select
                  value={state.settings.sort}
                  onChange={(event) => updateSettings({ sort: event.target.value as SortMode })}
                  aria-label="Sort apps"
                >
                  <option value="name">Name</option>
                  <option value="recent">Recent</option>
                  <option value="size">Size</option>
                </select>
                <ChevronDown size={13} />
              </div>

              <Segmented
                ariaLabel="Layout"
                value={view}
                onChange={(next) => updateSettings({ view: next })}
                options={[
                  { value: 'grid', label: '', icon: <LayoutGrid size={14} /> },
                  { value: 'list', label: '', icon: <List size={15} /> },
                ]}
              />

              <IconButton label="Rescan library" onClick={scan}>
                <RefreshCw size={15} className={state.scanning ? 'spin' : ''} />
              </IconButton>
            </div>
          </header>

          {progress?.phase === 'enrich' && progress.total
            ? (
              <div className="scan-track" aria-hidden="true">
                <span style={{ width: `${Math.round(((progress.done || 0) / progress.total) * 100)}%` }} />
              </div>
              )
            : null}

          <div className={`content-scroll ${view}`}>
            {visibleApps.length === 0 && state.scanning && total === 0
              ? (
                <div className={view === 'grid' ? 'card-grid' : 'row-list'}>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className={`skeleton ${view === 'grid' ? 'skeleton-card' : 'skeleton-row'}`} style={{ animationDelay: `${index * 70}ms` }} />
                  ))}
                </div>
                )
              : visibleApps.length === 0
                ? (
                  <EmptyState
                    query={query}
                    filter={filter}
                    total={total}
                    onClearSearch={() => setQuery('')}
                    onResetFilter={() => setFilter('all')}
                    onImport={importApps}
                    onAddFolder={addFolder}
                    onScan={scan}
                  />
                  )
                : view === 'grid'
                  ? (
                    <div className="card-grid">
                      {visibleApps.map((app, index) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          index={index}
                          launching={launching.includes(app.id)}
                          onLaunch={launch}
                          onStop={stop}
                          onSelect={(target) => setSelectedId(target.id)}
                          onFavorite={toggleFavorite}
                        />
                      ))}
                      <button type="button" className="card-add" onClick={importApps}>
                        <span className="card-add-icon"><Plus size={20} /></span>
                        <span>Add AppImage</span>
                      </button>
                    </div>
                    )
                  : (
                    <div className="row-list">
                      {visibleApps.map((app) => (
                        <AppRow
                          key={app.id}
                          app={app}
                          launching={launching.includes(app.id)}
                          onLaunch={launch}
                          onStop={stop}
                          onSelect={(target) => setSelectedId(target.id)}
                          onFavorite={toggleFavorite}
                        />
                      ))}
                      <button type="button" className="row-add" onClick={importApps}>
                        <Plus size={15} /> Add AppImage
                      </button>
                    </div>
                    )}
          </div>
        </main>
      </div>

      {selected && (
        <DetailSheet
          app={selected}
          launching={launching.includes(selected.id)}
          onClose={() => setSelectedId(null)}
          onLaunch={launch}
          onStop={stop}
          onFavorite={toggleFavorite}
          onRename={rename}
          onPickIcon={pickIcon}
          onResetIcon={resetIcon}
          onReveal={(app) => api.reveal(app.id)}
          onRefresh={refreshMeta}
          onRemove={remove}
          onNotify={notify}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          state={state}
          onClose={() => setSettingsOpen(false)}
          onUpdate={updateSettings}
          onAddFolder={addFolder}
          onRemoveFolder={removeFolder}
          onScan={scan}
          onClearHidden={clearHidden}
          onImport={importApps}
        />
      )}

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card glass">
            <span className="drop-icon"><Plus size={22} /></span>
            <div>Drop to add to GlassDeck</div>
            <p>.AppImage files only</p>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function EmptyState ({
  query, filter, total, onClearSearch, onResetFilter, onImport, onAddFolder, onScan,
}: {
  query: string
  filter: Filter
  total: number
  onClearSearch: () => void
  onResetFilter: () => void
  onImport: () => void
  onAddFolder: () => void
  onScan: () => void
}) {
  if (query) {
    return (
      <div className="empty">
        <div className="empty-orb"><Search size={26} /></div>
        <h2>Nothing matches “{query}”</h2>
        <p>Try a different name, category, or path.</p>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={onClearSearch}>Clear search</button>
        </div>
      </div>
    )
  }

  if (total > 0) {
    return (
      <div className="empty">
        <div className="empty-orb"><Sparkles size={26} /></div>
        <h2>{filter === 'favorites' ? 'No favorites yet' : filter === 'running' ? 'Nothing is running' : 'Nothing opened recently'}</h2>
        <p>
          {filter === 'favorites'
            ? 'Tap the heart on any app to keep it close.'
            : filter === 'running'
              ? 'Launched apps will show up here while they are alive.'
              : 'Apps you launch will appear here first.'}
        </p>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={onResetFilter}>Browse all apps</button>
        </div>
      </div>
    )
  }

  return (
    <div className="empty">
      <div className="empty-orb"><Sparkles size={26} /></div>
      <h2>Your shelf is empty</h2>
      <p>
        Add the folders where your AppImages live, or drop files right onto this window.
        GlassDeck reads names, icons and descriptions straight out of each file.
      </p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={onImport}>
          <Plus size={15} /> Add AppImage
        </button>
        <button type="button" className="btn" onClick={onAddFolder}>
          <FolderPlus size={15} /> Add folder
        </button>
        <button type="button" className="btn subtle" onClick={onScan}>
          <RefreshCw size={14} /> Scan
        </button>
      </div>
    </div>
  )
}
