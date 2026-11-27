import { Check, Info, X } from 'lucide-react'
import type { Toast } from '../types'

export default function Toasts ({
  toasts, onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string | number) => void
}) {
  if (!toasts.length) return null

  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast glass ${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? <Check size={13} /> : <Info size={13} />}
          </span>
          <div className="toast-body">
            <div className="toast-msg">{toast.message}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => { toast.action?.run(); onDismiss(toast.id) }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
