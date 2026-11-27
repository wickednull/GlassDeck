import { useEffect, useState } from 'react'
import {
  Check, Copy, FolderOpen, Heart, Image, Info, Pencil, Play, RefreshCw, Square, Trash, X,
} from 'lucide-react'
import type { AppEntry } from '../types'
import AppIcon from './AppIcon'
import { formatBytes, relativeTime } from '../lib/format'

type Props = {
  app: AppEntry
  launching: boolean
  onClose: () => void
  onLaunch: (app: AppEntry) => void
  onStop: (app: AppEntry) => void
  onFavorite: (app: AppEntry) => void
  onRename: (app: AppEntry, name: string) => void
  onPickIcon: (app: AppEntry) => void
  onResetIcon: (app: AppEntry) => void
  onReveal: (app: AppEntry) => void
  onRefresh: (app: AppEntry) => void
  onRemove: (app: AppEntry) => void
  onNotify: (kind: 'info' | 'success' | 'error', message: string) => void
}

export default function DetailSheet ({
  app, launching, onClose, onLaunch, onStop, onFavorite, onRename,
  onPickIcon, onResetIcon, onReveal, onRefresh, onRemove, onNotify,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(app.name)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setEditing(false)
    setDraft(app.name)
    setConfirmRemove(false)
    setCopied(false)
  }, [app.id])

  async function copyPath () {
    try {
      await window.glassdeck.copyText(app.path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      onNotify('error', 'Could not copy the path')
    }
  }

  function commitRename () {
    const name = draft.trim()
    onRename(app, name)
    setEditing(false)
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className="sheet detail-sheet glass" role="dialog" aria-modal="true" aria-label={`${app.name} details`}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="detail-hero">
          <div className={`detail-icon-wrap ${app.running ? 'live' : ''}`}>
            <AppIcon app={app} size={148} />
            {app.running && <span className="detail-live"><span />Running</span>}
          </div>

          <div className="detail-head">
            <div className="chip-row">
              <span className="chip accent">{app.category}</span>
              {app.version && <span className="chip">v{app.version}</span>}
              <span className="chip quiet">{formatBytes(app.size)}</span>
              {!app.executable && <span className="chip warn">Not executable</span>}
            </div>

            {editing
              ? (
                <div className="rename-row">
                  <input
                    autoFocus
                    className="text-input rename-input"
                    value={draft}
                    maxLength={80}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename()
                      if (event.key === 'Escape') { setDraft(app.name); setEditing(false) }
                    }}
                  />
                  <button type="button" className="mini-confirm" onClick={commitRename}>Save</button>
                </div>
                )
              : (
                <h2 className="detail-name" onDoubleClick={() => setEditing(true)}>
                  {app.name}
                  <button
                    type="button"
                    className="name-edit"
                    aria-label="Rename app"
                    onClick={() => { setDraft(app.name); setEditing(true) }}
                  >
                    <Pencil size={13} />
                  </button>
                </h2>
                )}

            <p className="detail-comment">
              {app.comment || app.genericName || 'This AppImage does not ship a description.'}
            </p>

            <div className="detail-stats">
              <span><b>{app.launchCount}</b> {app.launchCount === 1 ? 'launch' : 'launches'}</span>
              <span className="dot-sep" />
              <span>{relativeTime(app.lastPlayed)}</span>
              <span className="dot-sep" />
              <span>{app.source === 'manual' ? 'Added manually' : 'Auto-detected'}</span>
            </div>
          </div>
        </div>

        {!app.executable && (
          <div className="notice">
            <Info size={15} />
            <span>This file is missing the execute bit, so Linux will refuse to run it.</span>
            <button
              type="button"
              className="notice-action"
              onClick={async () => {
                const result = await window.glassdeck.fixExecutable(app.id)
                if (result.ok) onNotify('success', 'Execute permission added')
                else onNotify('error', result.message || 'Could not change permissions')
              }}
            >
              Fix permission
            </button>
          </div>
        )}

        <div className="detail-actions">
          {app.running
            ? (
              <button type="button" className="btn primary stop" onClick={() => onStop(app)}>
                <Square size={15} fill="currentColor" /> Stop app
              </button>
              )
            : (
              <button
                type="button"
                className="btn primary"
                onClick={() => onLaunch(app)}
                disabled={launching}
              >
                <Play size={16} fill="currentColor" /> {launching ? 'Launching…' : 'Launch'}
              </button>
              )}
          <button
            type="button"
            className={`btn icon-only ${app.favorite ? 'favorited' : ''}`}
            onClick={() => onFavorite(app)}
            title="Favorite"
            aria-label="Toggle favorite"
          >
            <Heart size={16} fill={app.favorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="btn icon-only" onClick={() => onReveal(app)} title="Show in folder" aria-label="Show in folder">
            <FolderOpen size={16} />
          </button>
          <button type="button" className="btn icon-only" onClick={() => onPickIcon(app)} title="Change icon" aria-label="Change icon">
            <Image size={16} />
          </button>
          {app.customIconFile && (
            <button type="button" className="btn icon-only" onClick={() => onResetIcon(app)} title="Restore original icon" aria-label="Restore original icon">
              <RefreshCw size={15} />
            </button>
          )}
        </div>

        <div className="path-row">
          <code title={app.path}>{app.path}</code>
          <button type="button" className="copy-btn" onClick={copyPath} aria-label="Copy path">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>

        <div className="detail-foot">
          <button
            type="button"
            className={`ghost-danger ${confirmRemove ? 'confirm' : ''}`}
            onClick={() => {
              if (!confirmRemove) {
                setConfirmRemove(true)
                setTimeout(() => setConfirmRemove(false), 3500)
                return
              }
              onRemove(app)
            }}
          >
            <Trash size={14} />
            {confirmRemove ? 'Click again to remove' : 'Remove from library'}
          </button>
          <div className="foot-links">
            <button type="button" className="foot-link" onClick={() => onRefresh(app)}>
              <RefreshCw size={12} /> Re-read metadata
            </button>
            <span className="foot-hint">Removing never deletes the file.</span>
          </div>
        </div>
      </section>
    </div>
  )
}
