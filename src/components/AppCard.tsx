import { useRef } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { Ellipsis, Heart, Play, Square } from 'lucide-react'
import type { AppEntry } from '../types'
import AppIcon from './AppIcon'
import { formatBytes, relativeTime } from '../lib/format'

type CardProps = {
  app: AppEntry
  index: number
  launching: boolean
  onLaunch: (app: AppEntry) => void
  onStop: (app: AppEntry) => void
  onSelect: (app: AppEntry) => void
  onFavorite: (app: AppEntry) => void
}

function useSheen () {
  const ref = useRef<HTMLElement | null>(null)
  const onMouseMove = (event: MouseEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    el.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }
  return { ref, onMouseMove }
}

export function AppCard ({
  app, index, launching, onLaunch, onStop, onSelect, onFavorite,
}: CardProps) {
  const { ref, onMouseMove } = useSheen()

  return (
    <article
      ref={ref as React.RefObject<HTMLElement>}
      className={`card ${app.running ? 'is-running' : ''} ${launching ? 'is-launching' : ''}`}
      style={{ '--i': index } as CSSProperties}
      onMouseMove={onMouseMove}
      onClick={() => (app.running ? onSelect(app) : onLaunch(app))}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          app.running ? onSelect(app) : onLaunch(app)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={app.running ? `${app.name} is running — open details` : `Launch ${app.name}`}
    >
      <div className="card-glow" aria-hidden="true" />

      <div className="card-actions">
        <button
          type="button"
          className={`round-btn heart ${app.favorite ? 'on' : ''}`}
          title={app.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={app.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(event) => { event.stopPropagation(); onFavorite(app) }}
        >
          <Heart size={13} fill={app.favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="round-btn"
          title="Details"
          aria-label={`Details for ${app.name}`}
          onClick={(event) => { event.stopPropagation(); onSelect(app) }}
        >
          <Ellipsis size={14} />
        </button>
      </div>

      <div className="icon-stage">
        <AppIcon app={app} size={86} />
        <button
          type="button"
          className={`play-badge ${app.running ? 'stop' : ''}`}
          title={app.running ? 'Stop' : 'Launch'}
          aria-label={app.running ? `Stop ${app.name}` : `Launch ${app.name}`}
          onClick={(event) => {
            event.stopPropagation()
            app.running ? onStop(app) : onLaunch(app)
          }}
        >
          {app.running ? <Square size={15} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        {app.running && <span className="run-ping" aria-hidden="true" />}
      </div>

      <div className="card-info">
        <div className="card-name" title={app.name}>{app.name}</div>
        <div className="card-meta">
          {app.running ? <span className="running-label">Running now</span> : `${app.category} · ${formatBytes(app.size)}`}
        </div>
      </div>

      {!app.executable && <span className="perm-flag" title="Not executable">!</span>}
    </article>
  )
}

export function AppRow ({
  app, launching, onLaunch, onStop, onSelect, onFavorite,
}: Omit<CardProps, 'index'>) {
  return (
    <div
      className={`app-row ${app.running ? 'is-running' : ''} ${launching ? 'is-launching' : ''}`}
      onClick={() => (app.running ? onSelect(app) : onLaunch(app))}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          app.running ? onSelect(app) : onLaunch(app)
        }
      }}
    >
      <AppIcon app={app} size={42} />
      <div className="row-main">
        <div className="row-name">{app.name}</div>
        <div className="row-sub">
          {app.running ? <span className="running-label">Running now</span> : (app.comment || app.category)}
        </div>
      </div>
      <div className="row-cat">{app.category}</div>
      <div className="row-size">{formatBytes(app.size)}</div>
      <div className="row-last">{app.lastPlayed ? relativeTime(app.lastPlayed) : '—'}</div>
      <div className="row-actions">
        <button
          type="button"
          className={`round-btn heart ${app.favorite ? 'on' : ''}`}
          aria-label="Toggle favorite"
          onClick={(event) => { event.stopPropagation(); onFavorite(app) }}
        >
          <Heart size={13} fill={app.favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className={`round-btn play ${app.running ? 'stop' : ''}`}
          aria-label={app.running ? 'Stop' : 'Launch'}
          onClick={(event) => {
            event.stopPropagation()
            app.running ? onStop(app) : onLaunch(app)
          }}
        >
          {app.running ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="round-btn"
          aria-label="Details"
          onClick={(event) => { event.stopPropagation(); onSelect(app) }}
        >
          <Ellipsis size={14} />
        </button>
      </div>
    </div>
  )
}
