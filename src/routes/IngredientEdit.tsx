import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import { DEFAULT_UNIT, newId, normalizeUnit, UNITS, type Ingredient, type Unit } from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

export function IngredientEdit() {
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const { client, writeAccess } = useAuth()
  const { data, loading, error, reload } = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const [name, setName] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [defaultUnit, setDefaultUnit] = useState<Unit>(DEFAULT_UNIT)
  const [labelInput, setLabelInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const existing = !isNew && data ? data.find((i) => i.id === id) : undefined

  // Autocompletion source: every label already used across the catalog, minus the
  // ones already on this ingredient. Filtered by what's typed so far.
  const suggestions = useMemo(() => {
    const all = new Set<string>()
    for (const ing of data ?? []) for (const l of ing.labels) all.add(l)
    for (const l of labels) all.delete(l)
    const q = labelInput.trim().toLowerCase()
    return [...all]
      .filter((l) => !q || l.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12)
  }, [data, labels, labelInput])

  function addLabelValue(value: string) {
    const l = value.trim()
    if (l && !labels.includes(l)) setLabels([...labels, l])
    setLabelInput('')
  }

  useEffect(() => {
    if (loaded || !data) return
    if (existing) {
      setName(existing.name)
      setLabels(existing.labels)
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
      const next: Ingredient = {
        id: existing?.id ?? newId(),
        name: trimmed,
        labels,
        defaultUnit,
      }
      const others = data.filter((i) => i.id !== next.id)
      await writeJson(
        client,
        DATA_PATHS.ingredients,
        [...others, next],
        `${existing ? 'Update' : 'Add'} ingredient: ${trimmed}`,
      )
      navigate('/ingredients')
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Save failed.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!client || !data || !existing) return
    if (!confirm(`Delete “${existing.name}”?`)) return
    setBusy(true)
    setSaveError(null)
    try {
      await writeJson(
        client,
        DATA_PATHS.ingredients,
        data.filter((i) => i.id !== existing.id),
        `Delete ingredient: ${existing.name}`,
      )
      navigate('/ingredients')
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Delete failed.')
      setBusy(false)
    }
  }

  if (loading) return <Loading />
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
            {labels.length > 0 && (
              <div className="chips">
                {labels.map((l) => (
                  <button
                    key={l}
                    className="chip chip--removable"
                    onClick={() => setLabels(labels.filter((x) => x !== l))}
                  >
                    {l} <span aria-hidden>✕</span>
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
                    key={l}
                    type="button"
                    className="chip chip--add"
                    onClick={() => addLabelValue(l)}
                  >
                    + {l}
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
