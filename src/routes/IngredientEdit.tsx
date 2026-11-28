import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { ConflictError, DATA_PATHS, removeOp, upsertOp } from '../github/data'
import { DEFAULT_UNIT, newId, normalizeUnit, UNITS, type Ingredient, type Label, type Unit } from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { ErrorNote, Loading, PageHead, ReadOnlyBanner, CONFLICT_MSG } from '../components/ui'

export function IngredientEdit() {
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const { client, writeAccess } = useAuth()
  const { data, loading, error, reload, commit } = useCollection<Ingredient>(DATA_PATHS.ingredients)
  const labels = useCollection<Label>(DATA_PATHS.labels)

  const [name, setName] = useState('')
  const [labelIds, setLabelIds] = useState<string[]>([])
  // Labels typed here that don't exist yet: staged locally, persisted to labels.json on save.
  const [pendingLabels, setPendingLabels] = useState<Label[]>([])
  const [defaultUnit, setDefaultUnit] = useState<Unit>(DEFAULT_UNIT)
  const [labelInput, setLabelInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const existing = !isNew && data ? data.find((i) => i.id === id) : undefined

  // id → label, across the committed catalog plus labels staged in this edit.
  const labelById = useMemo(() => {
    const m = new Map<string, Label>()
    for (const l of labels.data ?? []) m.set(l.id, l)
    for (const l of pendingLabels) m.set(l.id, l)
    return m
  }, [labels.data, pendingLabels])

  // Autocompletion source: catalog labels not already attached, filtered by what's typed.
  const suggestions = useMemo(() => {
    const attached = new Set(labelIds)
    const q = labelInput.trim().toLowerCase()
    return (labels.data ?? [])
      .filter((l) => !attached.has(l.id))
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)
  }, [labels.data, labelIds, labelInput])

  function addLabelValue(value: string) {
    const label = value.trim()
    setLabelInput('')
    if (!label) return
    // Reuse an existing label (catalog or staged) matched case-insensitively; otherwise stage a new one.
    const match = [...(labels.data ?? []), ...pendingLabels].find(
      (l) => l.name.toLowerCase() === label.toLowerCase(),
    )
    const labelId = match?.id ?? newId()
    if (!match) setPendingLabels((p) => [...p, { id: labelId, name: label }])
    setLabelIds((ids) => (ids.includes(labelId) ? ids : [...ids, labelId]))
  }

  function removeLabel(labelId: string) {
    setLabelIds((ids) => ids.filter((x) => x !== labelId))
    setPendingLabels((p) => p.filter((l) => l.id !== labelId))
  }

  useEffect(() => {
    if (loaded || !data) return
    if (existing) {
      setName(existing.name)
      setLabelIds(existing.labelIds)
      setDefaultUnit(normalizeUnit(existing.defaultUnit))
    }
    setLoaded(true)
  }, [data, existing, loaded])

  function addLabel() {
    addLabelValue(labelInput)
  }

  function onLabelKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addLabel()
    }
  }

  async function save() {
    if (!client || !data) return
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setSaveError(null)
    try {
      // Persist any labels created during this edit before referencing them.
      if (pendingLabels.length > 0) {
        await labels.commit((cur) => {
          const ids = new Set(cur.map((l) => l.id))
          return [...cur, ...pendingLabels.filter((l) => !ids.has(l.id))]
        }, `Add label${pendingLabels.length > 1 ? 's' : ''}: ${pendingLabels.map((l) => l.name).join(', ')}`)
        setPendingLabels([])
      }
      const next: Ingredient = {
        id: existing?.id ?? newId(),
        name: trimmed,
        labelIds,
        defaultUnit,
      }
      await commit(
        upsertOp(next, existing ?? null),
        `${existing ? 'Update' : 'Add'} ingredient: ${trimmed}`,
      )
      navigate('/ingredients')
    } catch (e) {
      setSaveError(e instanceof ConflictError ? CONFLICT_MSG : ((e as GitHubError).message ?? 'Save failed.'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!client || !data || !existing) return
    if (!confirm(`Delete “${existing.name}”?`)) return
    setBusy(true)
    setSaveError(null)
    try {
      await commit(removeOp(existing.id, existing), `Delete ingredient: ${existing.name}`)
      navigate('/ingredients')
    } catch (e) {
      setSaveError(e instanceof ConflictError ? CONFLICT_MSG : ((e as GitHubError).message ?? 'Delete failed.'))
      setBusy(false)
    }
  }

  if (loading || labels.loading) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!isNew && data && !existing) {
    return <ErrorNote error="This ingredient no longer exists." />
  }

  return (
    <div className="stack">
      <PageHead title={isNew ? 'New ingredient' : 'Edit ingredient'} />
      <ReadOnlyBanner />

      <div className="box">
        <div className="box__body">
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Olive oil"
            />
          </label>

          <label className="field">
            <span className="field__label">Default unit</span>
            <select
              className="input"
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value as Unit)}
            >
              {UNITS.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span className="field__label">Labels</span>
            {labelIds.length > 0 && (
              <div className="chips">
                {labelIds.map((lid) => (
                  <button
                    key={lid}
                    className="chip chip--removable"
                    onClick={() => removeLabel(lid)}
                  >
                    {labelById.get(lid)?.name ?? '…'} <span aria-hidden>✕</span>
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              <input
                className="input"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={onLabelKey}
                placeholder="Add a label (e.g. Dairy) and press Enter"
              />
              <button className="btn btn--sm" onClick={addLabel} disabled={!labelInput.trim()}>
                Add
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="chips chips--suggest">
                {suggestions.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="chip chip--add"
                    onClick={() => addLabelValue(l.name)}
                  >
                    + {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {saveError && <p className="flash flash--error">{saveError}</p>}
        </div>
      </div>

      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={save}
          disabled={!writeAccess || busy || !name.trim()}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn" onClick={() => navigate(-1)} disabled={busy}>
          Cancel
        </button>
        {!isNew && (
          <button
            className="btn btn--danger"
            onClick={remove}
            disabled={!writeAccess || busy}
            title={writeAccess ? undefined : 'Read-only token'}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
