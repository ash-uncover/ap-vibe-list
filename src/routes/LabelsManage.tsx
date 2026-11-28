import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ConflictError, DATA_PATHS, removeOp, upsertOp } from '../github/data'
import type { Ingredient, Label } from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { CONFLICT_MSG, EmptyState, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

export function LabelsManage() {
  const { writeAccess } = useAuth()
  const labels = useCollection<Label>(DATA_PATHS.labels)
  const ingredients = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Usage count per label, derived from ingredient references.
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ing of ingredients.data ?? [])
      for (const id of ing.labelIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [ingredients.data])

  const sorted = useMemo(
    () => [...(labels.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [labels.data],
  )

  function fail(e: unknown) {
    setActionError(e instanceof ConflictError ? CONFLICT_MSG : ((e as GitHubError).message ?? 'Action failed.'))
  }

  async function rename(label: Label, nextName: string) {
    const trimmed = nextName.trim()
    if (!trimmed || trimmed === label.name) {
      setEditing(null)
      return
    }
    setBusyId(label.id)
    setActionError(null)
    try {
      await labels.commit(
        upsertOp({ ...label, name: trimmed }, label),
        `Rename label: ${label.name} → ${trimmed}`,
      )
      setEditing(null)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(label: Label) {
    const count = counts.get(label.id) ?? 0
    if (
      !confirm(
        count > 0
          ? `Delete label “${label.name}”? It will be removed from ${count} ingredient(s).`
          : `Delete label “${label.name}”?`,
      )
    )
      return
    setBusyId(label.id)
    setActionError(null)
    try {
      if (count > 0) {
        await ingredients.commit(
          (cur) =>
            cur.map((i) =>
              i.labelIds.includes(label.id)
                ? { ...i, labelIds: i.labelIds.filter((x) => x !== label.id) }
                : i,
            ),
          `Remove label from ingredients: ${label.name}`,
        )
      }
      await labels.commit(removeOp(label.id, label), `Delete label: ${label.name}`)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  async function merge(from: Label, toId: string) {
    const to = sorted.find((l) => l.id === toId)
    if (!to || to.id === from.id) return
    if (
      !confirm(
        `Merge “${from.name}” into “${to.name}”? Ingredients using “${from.name}” will use “${to.name}” instead.`,
      )
    )
      return
    setBusyId(from.id)
    setActionError(null)
    try {
      await ingredients.commit(
        (cur) =>
          cur.map((i) => {
            if (!i.labelIds.includes(from.id)) return i
            const merged = [...new Set(i.labelIds.map((x) => (x === from.id ? to.id : x)))]
            return { ...i, labelIds: merged }
          }),
        `Merge label ${from.name} into ${to.name}`,
      )
      await labels.commit(removeOp(from.id, from), `Delete label: ${from.name}`)
      setMergingId(null)
    } catch (e) {
      fail(e)
    } finally {
      setBusyId(null)
    }
  }

  if (labels.loading || ingredients.loading) return <Loading />
  if (labels.error) return <ErrorNote error={labels.error} onRetry={labels.reload} />

  return (
    <div className="stack">
      <PageHead title="Manage labels" />
      <ReadOnlyBanner />

      <Link to="/ingredients" className="btn btn--sm">
        ← Back to items
      </Link>

      {actionError && <p className="flash flash--error">{actionError}</p>}

      {sorted.length === 0 ? (
        <EmptyState
          title="No labels yet"
          hint="Labels are created while editing an ingredient. Add one there and it will show up here."
        />
      ) : (
        <ul className="rows">
          {sorted.map((label) => {
            const count = counts.get(label.id) ?? 0
            const busy = busyId === label.id
            const isEditing = editing?.id === label.id
            const isMerging = mergingId === label.id
            const others = sorted.filter((l) => l.id !== label.id)
            return (
              <li key={label.id}>
                <div className="rows__item">
                  {isEditing ? (
                    <input
                      className="input rows__main"
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: label.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(label, editing.name)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                  ) : (
                    <span className="rows__main">{label.name}</span>
                  )}
                  <span className="rows__meta">
                    {count} {count === 1 ? 'item' : 'items'}
                  </span>

                  {isEditing ? (
                    <div className="row">
                      <button
                        className="btn btn--sm btn--primary"
                        onClick={() => rename(label, editing.name)}
                        disabled={busy || !editing.name.trim()}
                      >
                        Save
                      </button>
                      <button className="btn btn--sm" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  ) : isMerging ? (
                    <div className="row">
                      <select
                        className="input"
                        autoFocus
                        value=""
                        disabled={busy || others.length === 0}
                        onChange={(e) => e.target.value && merge(label, e.target.value)}
                      >
                        <option value="">Merge into…</option>
                        {others.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn--sm" onClick={() => setMergingId(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="row">
                      <button
                        className="btn btn--sm"
                        onClick={() => setEditing({ id: label.id, name: label.name })}
                        disabled={!writeAccess || busy}
                        title={writeAccess ? undefined : 'Read-only token'}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn--sm"
                        onClick={() => setMergingId(label.id)}
                        disabled={!writeAccess || busy || others.length === 0}
                        title={writeAccess ? undefined : 'Read-only token'}
                      >
                        Merge
                      </button>
                      <button
                        className="btn btn--sm btn--danger-ghost"
                        onClick={() => remove(label)}
                        disabled={!writeAccess || busy}
                        title={writeAccess ? undefined : 'Read-only token'}
                      >
                        {busy ? '…' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
