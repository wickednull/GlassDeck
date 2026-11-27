import type { ReactNode } from 'react'

export function IconButton ({
  label, onClick, children, className = '', active = false, disabled = false,
}: {
  label: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  className?: string
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string> ({
  value, options, onChange, ariaLabel,
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-item ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label && <span>{option.label}</span>}
        </button>
      ))}
    </div>
  )
}

export function Switch ({
  checked, onChange, label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

export function SettingRow ({
  title, description, children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-title">{title}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}
