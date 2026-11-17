import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import {
  DEFAULT_UNIT,
  newId,
  UNITS,
  type Ingredient,
  type Item,
  type Unit,
} from '../github/model'
import type { GitHubError } from '../github/types'

interface Props {
  catalog: Ingredient[]
  items: Item[]
  onChange: (items: Item[]) => void
  /** Called after a quick-create commits a new ingredient, so the parent can reload. */
  onCatalogChange: () => void
}

export function IngredientPicker({ catalog, items, onChange, onCatalogChange }: Props) {
  const { client, writeAccess } = useAuth()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i] as const)), [catalog])
  const selectedIds = useMemo(() => new Set(items.map((i) => i.ingredientId)), [items])

  const q = query.trim().toLowerCase()
  const matches = q
    ? catalog.filter((i) => !selectedIds.has(i.id) && i.name.toLowerCase().includes(q))
    : catalog.filter((i) => !selectedIds.has(i.id))
  const exactExists = catalog.some((i) => i.name.toLowerCase() === q)

  function add(ingredientId: string) {
    const unit = byId.get(ingredientId)?.defaultUnit ?? DEFAULT_UNIT
    onChange([...items, { ingredientId, quantity: 1, unit }])
    setQuery('')
  }

  function remove(ingredientId: string) {
    onChange(items.filter((i) => i.ingredientId !== ingredientId))
  }

  function patch(ingredientId: string, patch: Partial<Item>) {
    onChange(items.map((i) => (i.ingredientId === ingredientId ? { ...i, ...patch } : i)))
  }

  async function quickCreate() {
    const name = query.trim()
    if (!name || !client) return
    setBusy(true)
    setError(null)
    try {
      const ing: Ingredient = { id: newId(), name, labels: [], defaultUnit: DEFAULT_UNIT }
      await writeJson(
        client,
        DATA_PATHS.ingredients,
        [...catalog, ing],
        `Add ingredient: ${name}`,
      )
      onChange([...items, { ingredientId: ing.id, quantity: 1, unit: ing.defaultUnit }])
      setQuery('')
      onCatalogChange()
    } catch (e) {
      setError((e as GitHubError).message ?? 'Could not create ingredient.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="picker">
      {items.length > 0 ? (
        <ul className="picker__selected">
          {items.map((it) => (
            <li key={it.ingredientId} className="picker__row">
              <span className="picker__name">
                {byId.get(it.ingredientId)?.name ?? 'Unknown item'}
              </span>
              <input
                className="input input--qty"
                type="number"
                min="0"
                step="any"
                value={Number.isFinite(it.quantity) ? it.quantity : ''}
                onChange={(e) =>
                  patch(it.ingredientId, { quantity: Number(e.target.value) || 0 })
                }
                aria-label="Quantity"
              />
              <select
                className="input input--unit"
                value={it.unit}
                onChange={(e) => patch(it.ingredientId, { unit: e.target.value as Unit })}
                aria-label="Unit"
              >
                {UNITS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn--sm btn--danger-ghost"
                onClick={() => remove(it.ingredientId)}
                aria-label="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted picker__empty">No ingredients yet — search below to add.</p>
      )}

      <input
        className="input"
        placeholder="Search the catalog…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <p className="flash flash--error">{error}</p>}

      {q && !exactExists && writeAccess && (
        <button className="btn btn--primary btn--block" onClick={quickCreate} disabled={busy}>
          {busy ? 'Creating…' : `Create “${query.trim()}”`}
        </button>
      )}

      {q && matches.length > 0 && (
        <ul className="picker__catalog">
          {matches.slice(0, 20).map((i) => (
            <li key={i.id}>
              <button className="picker__add" onClick={() => add(i.id)}>
                <span className="picker__add-name">{i.name}</span>
                <span className="picker__plus" aria-hidden>
                  ＋
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
