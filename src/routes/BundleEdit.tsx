import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import { DEFAULT_UNIT, newId, normalizeItem, type Bundle, type BundleKind, type Ingredient, type Item } from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { IngredientPicker } from '../components/IngredientPicker'
import { ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

interface Props {
  kind: BundleKind
}

const COPY = {
  recipe: { path: DATA_PATHS.recipes, base: '/recipes', one: 'recipe' },
  template: { path: DATA_PATHS.templates, base: '/templates', one: 'template' },
} as const

export function BundleEdit({ kind }: Props) {
  const copy = COPY[kind]
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const { client, writeAccess } = useAuth()

  const bundles = useCollection<Bundle>(copy.path)
  const ingredients = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const [name, setName] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const existing = !isNew && bundles.data ? bundles.data.find((b) => b.id === id) : undefined

  useEffect(() => {
    if (loaded || !bundles.data || !ingredients.data) return
    if (existing) {
      setName(existing.name)
      const defaults = new Map(ingredients.data.map((i) => [i.id, i.defaultUnit] as const))
      setItems(
        existing.items.map((r) => normalizeItem(r, defaults.get(r.ingredientId) ?? DEFAULT_UNIT)),
      )
    }
    setLoaded(true)
  }, [bundles.data, ingredients.data, existing, loaded])

  async function save() {
    if (!client || !bundles.data) return
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setSaveError(null)
    try {
      const next: Bundle = { id: existing?.id ?? newId(), name: trimmed, kind, items }
      const others = bundles.data.filter((b) => b.id !== next.id)
      await writeJson(
        client,
        copy.path,
        [...others, next],
        `${existing ? 'Update' : 'Add'} ${copy.one}: ${trimmed}`,
      )
      navigate(copy.base)
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Save failed.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!client || !bundles.data || !existing) return
    if (!confirm(`Delete “${existing.name}”?`)) return
    setBusy(true)
    setSaveError(null)
    try {
      await writeJson(
        client,
        copy.path,
        bundles.data.filter((b) => b.id !== existing.id),
        `Delete ${copy.one}: ${existing.name}`,
      )
      navigate(copy.base)
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Delete failed.')
      setBusy(false)
    }
  }

  if (bundles.loading || ingredients.loading) return <Loading />
  if (bundles.error) return <ErrorNote error={bundles.error} onRetry={bundles.reload} />
  if (ingredients.error) return <ErrorNote error={ingredients.error} onRetry={ingredients.reload} />
  if (!isNew && bundles.data && !existing) {
    return <ErrorNote error={`This ${copy.one} no longer exists.`} />
  }

  return (
    <div className="stack">
      <PageHead title={isNew ? `New ${copy.one}` : `Edit ${copy.one}`} />
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
              placeholder={kind === 'recipe' ? 'e.g. Spaghetti bolognese' : 'e.g. Weekly Grocery'}
            />
          </label>

          <div className="field">
            <span className="field__label">Ingredients</span>
            <IngredientPicker
              catalog={ingredients.data ?? []}
              items={items}
              onChange={setItems}
              onCatalogChange={ingredients.reload}
            />
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
