import { useEffect, useState } from 'react'
import { Layers, Minus, Square, X, Maximize2 } from 'lucide-react'

export default function Titlebar () {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.glassdeck.isMaximized().then(setMaximized).catch(() => {})
    const onResize = () => { window.glassdeck.isMaximized().then(setMaximized).catch(() => {}) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true"><Layers size={13} strokeWidth={2.2} /></span>
        <span className="brand-word">GlassDeck</span>
        <span className="brand-tag">AppImage launcher</span>
      </div>

      <div className="titlebar-drag" />

      <div className="window-controls">
        <button
          type="button"
          className="window-btn"
          aria-label="Minimize"
          onClick={() => window.glassdeck.minimize()}
        >
          <Minus size={12} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          className="window-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={async () => setMaximized(await window.glassdeck.toggleMaximize())}
        >
          {maximized ? <Square size={10} strokeWidth={2.4} /> : <Maximize2 size={11} strokeWidth={2.4} />}
        </button>
        <button
          type="button"
          className="window-btn close"
          aria-label="Close"
          onClick={() => window.glassdeck.close()}
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      </div>
    </header>
  )
}
