import {
  Clock, Folder, HardDrive, Heart, LayoutGrid, Play, Plus, RefreshCw, Settings, X,
} from 'lucide-react'
import type { AppState, Filter } from '../types'
import { formatBytes, plural } from '../lib/format'

type Props = {
  state: AppState
  filter: Filter
  onFilter: (filter: Filter) => void
  onAddFolder: () => void
  onRemoveFolder: (folder: string) => void
  onOpenSettings: () => void
  onImport: () => void
  onScan: () => void
}

export default function Sidebar ({
  state, filter, onFilter, onAddFolder, onRemoveFolder, onOpenSettings, onImport, onScan,
}: Props) {
  const { stats, folders, settings } = state
  const favShare = stats.total ? Math.max(6, Math.round((stats.favorites / stats.total) * 100)) : 0

  const items: { id: Filter; label: string; icon: typeof LayoutGrid; count?: number }[] = [
    { id: 'all', label: 'All apps', icon: LayoutGrid, count: stats.total },
    { id: 'favorites', label: 'Favorites', icon: Heart, count: stats.favorites },
    { id: 'running', label: 'Running', icon: Play, count: stats.running },
    { id: 'recent', label: 'Recent', icon: Clock },
  ]

  return (
    <aside className="sidebar glass">
      <div className="side-head">
        <div className="side-nav-label">
          <span>Library</span>
          <button type="button" className="mini-btn" onClick={onScan} title="Rescan library" aria-label="Rescan library">
            <RefreshCw size={12} className={state.scanning ? 'spin' : ''} />
          </button>
        </div>
        <nav className="nav">
          {items.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${filter === id ? 'active' : ''}`}
              onClick={() => onFilter(id)}
            >
              <span className="nav-icon"><Icon size={16} strokeWidth={2.1} /></span>
              <span className="nav-text">{label}</span>
              {typeof count === 'number' && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="side-section">
        <div className="side-nav-label">
          <span>Folders</span>
          <button type="button" className="mini-btn" onClick={onAddFolder} title="Add folder" aria-label="Add folder">
            <Plus size={13} />
          </button>
        </div>
        <ul className="folder-list">
          {folders.map((folder) => (
            <li key={folder.path} className={`folder-row ${folder.exists ? '' : 'missing'}`}>
              <Folder size={13} className="folder-icon" />
              <span className="folder-name" title={folder.path}>{folder.display}</span>
              <span className="folder-count">{folder.count}</span>
              <button
                type="button"
                className="folder-remove"
                title="Stop scanning this folder"
                aria-label={`Stop scanning ${folder.display}`}
                onClick={() => onRemoveFolder(folder.path)}
              >
                <X size={11} />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="folder-add" onClick={onAddFolder}>
              <Plus size={12} />
              <span>Add folder</span>
            </button>
          </li>
        </ul>
      </div>

      <div className="side-spacer" />

      <div className="storage-card">
        <div className="storage-head">
          <HardDrive size={13} />
          <span>On disk</span>
        </div>
        <div className="storage-value">{formatBytes(stats.size)}</div>
        <div className="storage-bar"><span style={{ width: `${favShare}%` }} /></div>
        <div className="storage-sub">
          {plural(stats.total, 'app')} · {plural(folders.length, 'folder')}
        </div>
      </div>

      <div className="side-actions">
        <button type="button" className="side-primary" onClick={onImport}>
          <Plus size={15} strokeWidth={2.4} />
          <span>Add AppImage</span>
        </button>
        <button type="button" className="side-ghost" onClick={onOpenSettings}>
          <Settings size={14} />
          <span>Settings</span>
          <span className="side-ghost-hint">{settings.theme === 'auto' ? 'auto' : settings.theme}</span>
        </button>
      </div>
    </aside>
  )
}
