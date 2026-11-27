import {
  Folder, FolderPlus, Heart, Info, Monitor, Moon, Plus, RefreshCw, Search, Sun, X, Zap,
} from 'lucide-react'
import type { Accent, AppState, Settings } from '../types'
import { Segmented, SettingRow, Switch } from './ui'
import { formatBytes, plural } from '../lib/format'

const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'blue', label: 'Ocean', color: '#0a84ff' },
  { id: 'violet', label: 'Violet', color: '#a855f7' },
  { id: 'pink', label: 'Rose', color: '#ff375f' },
  { id: 'teal', label: 'Mint', color: '#2dd4bf' },
  { id: 'green', label: 'Lime', color: '#30d158' },
  { id: 'orange', label: 'Amber', color: '#ff9f0a' },
]

type Props = {
  state: AppState
  onClose: () => void
  onUpdate: (patch: Partial<Settings>) => void
  onAddFolder: () => void
  onRemoveFolder: (folder: string) => void
  onScan: () => void
  onClearHidden: () => void
  onImport: () => void
}

export default function SettingsSheet ({
  state, onClose, onUpdate, onAddFolder, onRemoveFolder, onScan, onClearHidden, onImport,
}: Props) {
  const { settings, folders, stats } = state

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className="sheet settings-sheet glass" role="dialog" aria-modal="true" aria-label="Settings">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <header className="sheet-head">
          <div className="eyebrow">PREFERENCES</div>
          <h2>Make it yours</h2>
          <p>Everything lives on this machine. No accounts, no telemetry.</p>
        </header>

        <div className="settings-scroll">
          <div className="settings-section">
            <div className="section-title">Appearance</div>

            <SettingRow title="Theme" description="Follow the system or pick a side.">
              <Segmented
                ariaLabel="Theme"
                value={settings.theme}
                onChange={(theme) => onUpdate({ theme })}
                options={[
                  { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
                  { value: 'light', label: 'Light', icon: <Sun size={13} /> },
                  { value: 'auto', label: 'Auto', icon: <Monitor size={13} /> },
                ]}
              />
            </SettingRow>

            <SettingRow title="Accent glow" description="Tints the glass, highlights and launch pulse.">
              <div className="accent-row">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.id}
                    type="button"
                    className={`accent-dot ${settings.accent === accent.id ? 'active' : ''}`}
                    style={{ '--swatch': accent.color } as React.CSSProperties}
                    title={accent.label}
                    aria-label={accent.label}
                    onClick={() => onUpdate({ accent: accent.id })}
                  >
                    {settings.accent === accent.id && <Heart size={9} fill="currentColor" />}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow title="Reduce motion" description="Turns off floats, springs and background drift.">
              <Switch
                label="Reduce motion"
                checked={settings.reduceMotion}
                onChange={(reduceMotion) => onUpdate({ reduceMotion })}
              />
            </SettingRow>

            <SettingRow
              title="Living background"
              description="Slow aurora drift and pulsing indicators. Off by default because it costs CPU on systems without GPU acceleration."
            >
              <Switch
                label="Living background"
                checked={settings.ambientMotion}
                onChange={(ambientMotion) => onUpdate({ ambientMotion })}
              />
            </SettingRow>

            <SettingRow title="Layout" description="Cards feel like a home screen; rows are denser.">
              <Segmented
                ariaLabel="Layout"
                value={settings.view}
                onChange={(view) => onUpdate({ view })}
                options={[
                  { value: 'grid', label: 'Grid' },
                  { value: 'list', label: 'List' },
                ]}
              />
            </SettingRow>
          </div>

          <div className="settings-section">
            <div className="section-title">Library</div>

            <div className="settings-block">
              {folders.map((folder) => (
                <div key={folder.path} className={`settings-folder ${folder.exists ? '' : 'missing'}`}>
                  <span className="settings-folder-icon"><Folder size={14} /></span>
                  <div className="settings-folder-main">
                    <div className="settings-folder-path">{folder.display}</div>
                    <div className="settings-folder-sub">
                      {folder.exists ? `${plural(folder.count, 'AppImage')} found` : 'Folder not found'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mini-btn"
                    title="Remove folder"
                    aria-label={`Remove ${folder.display}`}
                    onClick={() => onRemoveFolder(folder.path)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              <button type="button" className="settings-add-folder" onClick={onAddFolder}>
                <FolderPlus size={14} /> Add a folder to scan
              </button>
              <p className="settings-note">
                GlassDeck looks up to 4 folders deep and keeps the file where it is. Nothing is copied or moved.
              </p>
            </div>

            <div className="settings-buttons">
              <button type="button" className="btn" onClick={onScan} disabled={state.scanning}>
                <RefreshCw size={14} className={state.scanning ? 'spin' : ''} />
                {state.scanning ? 'Scanning…' : 'Rescan now'}
              </button>
              <button type="button" className="btn" onClick={onImport}>
                <Plus size={14} /> Add AppImage
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">Launching</div>

            <SettingRow
              title="Extract mode"
              description="Skip FUSE mounting. Slower to start, but works on locked-down systems."
            >
              <Switch
                label="Always launch in extract mode"
                checked={settings.extractFallback}
                onChange={(extractFallback) => onUpdate({ extractFallback })}
              />
            </SettingRow>

            <SettingRow
              title="Restore hidden apps"
              description="Apps you removed are remembered as hidden. This clears that list."
            >
              <button type="button" className="btn subtle" onClick={onClearHidden}>
                Restore
              </button>
            </SettingRow>
          </div>

          <div className="settings-section about">
            <div className="about-mark"><Zap size={16} /></div>
            <div className="about-main">
              <div className="about-title">GlassDeck <span>v{state.version}</span></div>
              <p>
                {plural(stats.total, 'AppImage')} · {formatBytes(stats.size)} on disk.
                Metadata and icons are read straight from each AppImage.
              </p>
              <div className="shortcuts">
                <span><kbd>Ctrl</kbd><kbd>K</kbd> search</span>
                <span><kbd>Ctrl</kbd><kbd>R</kbd> rescan</span>
                <span><kbd>Esc</kbd> close</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="settings-foot">
          <span><Info size={12} /> Single window · local files only</span>
          <span className="settings-foot-hint"><Search size={12} /> Tip: drop AppImages anywhere on the window</span>
        </footer>
      </section>
    </div>
  )
}
