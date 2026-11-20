import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

/** Standard message shown when a write is rejected because the repo changed underneath it. */
export const CONFLICT_MSG =
  'This changed in the repository since you opened it — the latest version is now shown. Please review and try again.'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted state">{label}</p>
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flash flash--error state">
      <span>{error}</span>
      {onRetry && (
        <button className="btn btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  )
}

/** A dismissable-looking banner shown on screens where writes are disabled. */
export function ReadOnlyBanner() {
  const { writeAccess } = useAuth()
  if (writeAccess) return null
  return (
    <div className="flash flash--warn">
      Your token is <strong>read-only</strong>. You can browse everything, but saving is
      disabled.
    </div>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>
}

export function PageHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="pagehead">
      <h1 className="pagehead__title">{title}</h1>
      {action}
    </div>
  )
}
