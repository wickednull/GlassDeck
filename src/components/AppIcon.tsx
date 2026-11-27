import { useState } from 'react'
import type { AppEntry } from '../types'
import { iconUrl, initials, monogramTint } from '../lib/format'

type Props = {
  app: AppEntry
  size?: number
  className?: string
}

/** Squircle app icon with a glassy rim + graceful monogram fallback. */
export default function AppIcon ({ app, size = 88, className = '' }: Props) {
  const [broken, setBroken] = useState(false)
  const src = iconUrl(app.iconFile, Math.round(app.mtimeMs || 0))

  return (
    <div
      className={`app-icon ${className}`.trim()}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.265) }}
    >
      {src && !broken
        ? (
          <img
            src={src}
            width={size}
            height={size}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
          />
          )
        : (
          <div
            className="app-icon-mono"
            style={{ background: monogramTint(app.name), fontSize: Math.round(size * 0.34) }}
          >
            {initials(app.name)}
          </div>
          )}
      <span className="app-icon-rim" />
    </div>
  )
}
