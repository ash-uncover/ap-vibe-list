import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import {
  DEFAULT_UNIT,
  effectiveItems,
  formatAmount,
  migrateList,
  newId,
  normalizeItem,
  type AttachedRecipe,
  type Bundle,
  type Ingredient,
  type Item,
  type ShoppingList,
} from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { IngredientPicker } from '../components/IngredientPicker'
import { RecipeGroups } from '../components/RecipeGroups'
import { ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'
import { clearDraft, DRAFT_NEW_LIST, getDraft, setDraft } from '../storage/drafts'

interface Draft {
  name: string
  items: Item[]
  recipes: AttachedRecipe[]
}

/** Merge user item lists, summing quantities of the same ingredient in the same unit. */
function mergeItems(base: Item[], add: Item[]): Item[] {
  const map = new Map<string, Item>()
  for (const it of [...base, ...add]) {
    const key = `${it.ingredientId}|${it.unit}`
    const prev = map.get(key)
    map.set(key, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it })
  }
  return [...map.values()]
}

export function ListAssemble() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromId = params.get('from')
  const { client, writeAccess } = useAuth()

  const lists = useCollection<ShoppingList>(DATA_PATHS.lists)
  const templates = useCollection<Bundle>(DATA_PATHS.templates)
  const recipes = useCollection<Bundle>(DATA_PATHS.recipes)
  const ingredients = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const initial = useMemo<Draft | null>(() => {
    const d = getDraft<Partial<Draft>>(DRAFT_NEW_LIST)
    return d ? { name: d.name ?? '', items: d.items ?? [], recipes: d.recipes ?? [] } : null
  }, [])
  const [draft, setDraftState] = useState<Draft>(
    initial ?? { name: '', items: [], recipes: [] },
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const cloneApplied = useRef(initial != null)

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i] as const)),
    [ingredients.data],
  )
  const unitFor = (id: string) => byId.get(id)?.defaultUnit ?? DEFAULT_UNIT

  // Persist working state so a refresh never loses it.
  useEffect(() => {
    setDraft(DRAFT_NEW_LIST, draft)
  }, [draft])

  // Clone from a past list: flatten its still-unbought effective items into user items.
  useEffect(() => {
    if (cloneApplied.current || !fromId || !lists.data || !ingredients.data) return
    const raw = lists.data.find((l) => l.id === fromId)
    if (raw) {
      const src = migrateList(raw, unitFor)
      const bought = new Set(src.bought)
      const items = effectiveItems(src.items, src.recipes).filter(
        (e) => !bought.has(`${e.ingredientId}|${e.unit}`),
      )
      setDraftState({ name: `${src.name} (copy)`, items, recipes: [] })
    }
    cloneApplied.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, lists.data, ingredients.data])

  // One-time migration of a restored draft that may use the old item shape.
  const normalized = useRef(false)
  useEffect(() => {
    if (normalized.current || !ingredients.data) return
    normalized.current = true
    setDraftState((d) => ({
      ...d,
      items: d.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
      recipes: d.recipes.map((g) => ({
        ...g,
        items: g.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
      })),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients.data])

  function applyTemplate(bundle: Bundle | undefined) {
    if (!bundle) return
    const norm = bundle.items.map((r) => normalizeItem(r, unitFor(r.ingredientId)))
    setDraftState((d) => ({ ...d, items: mergeItems(d.items, norm) }))
  }

  function attachRecipe(bundle: Bundle | undefined) {
    if (!bundle) return
    setDraftState((d) => {
      if (d.recipes.some((g) => g.recipeId === bundle.id)) return d
      const group: AttachedRecipe = {
        recipeId: bundle.id,
        name: bundle.name,
        items: bundle.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
      }
      return { ...d, recipes: [...d.recipes, group] }
    })
  }

  function detachRecipe(recipeId: string) {
    setDraftState((d) => ({ ...d, recipes: d.recipes.filter((g) => g.recipeId !== recipeId) }))
  }

  async function create() {
    if (!client || !lists.data) return
    setBusy(true)
    setSaveError(null)
    try {
      const list: ShoppingList = {
        id: newId(),
        name: draft.name.trim() || 'Shopping list',
        status: 'active',
        createdAt: new Date().toISOString(),
        items: draft.items,
        recipes: draft.recipes,
        bought: [],
      }
      await writeJson(client, DATA_PATHS.lists, [...lists.data, list], `Create list: ${list.name}`)
      clearDraft(DRAFT_NEW_LIST)
      navigate(`/lists/${list.id}`)
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Could not create the list.')
      setBusy(false)
    }
  }

  function discard() {
    clearDraft(DRAFT_NEW_LIST)
    setDraftState({ name: '', items: [], recipes: [] })
  }

  const anyLoading =
    lists.loading || templates.loading || recipes.loading || ingredients.loading
  const anyError = lists.error || templates.error || recipes.error || ingredients.error
  if (anyLoading) return <Loading />
  if (anyError) {
    return (
      <ErrorNote
        error={anyError}
        onRetry={() => {
          lists.reload()
          templates.reload()
          recipes.reload()
          ingredients.reload()
        }}
      />
    )
  }

  const templateList = templates.data ?? []
  const recipeList = (recipes.data ?? []).filter(
    (r) => !draft.recipes.some((g) => g.recipeId === r.id),
  )
  const effective = effectiveItems(draft.items, draft.recipes)
  const effByName = [...effective].sort((a, b) =>
    (byId.get(a.ingredientId)?.name ?? '').localeCompare(byId.get(b.ingredientId)?.name ?? ''),
  )

  return (
    <div className="stack">
      <PageHead title="New list" />
      <ReadOnlyBanner />

      <div className="box">
        <div className="box__body">
          <label className="field">
            <span className="field__label">List name</span>
            <input
              className="input"
              autoFocus
              value={draft.name}
              onChange={(e) => setDraftState((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Saturday shop"
            />
          </label>

          {templateList.length > 0 && (
            <label className="field">
              <span className="field__label">Start from a template</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  applyTemplate(templateList.find((t) => t.id === e.target.value))
                  e.target.value = ''
                }}
              >
                <option value="">Add a template’s items…</option>
                {templateList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="field">
            <span className="field__label">
              Your items {draft.items.length > 0 && `(${draft.items.length})`}
            </span>
            <IngredientPicker
              catalog={ingredients.data ?? []}
              items={draft.items}
              onChange={(items) => setDraftState((d) => ({ ...d, items }))}
              onCatalogChange={ingredients.reload}
            />
          </div>

          {recipeList.length > 0 && (
            <label className="field">
              <span className="field__label">Add a recipe</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  attachRecipe(recipes.data?.find((r) => r.id === e.target.value))
                  e.target.value = ''
                }}
              >
                <option value="">Attach a recipe…</option>
                {recipeList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          {draft.recipes.length > 0 && (
            <div className="field">
              <span className="field__label">Recipes</span>
              <RecipeGroups
                recipes={draft.recipes}
                catalog={ingredients.data ?? []}
                onDetach={detachRecipe}
              />
            </div>
          )}

          {effByName.length > 0 && (
            <details className="disclosure">
              <summary>Final list • {effByName.length} items</summary>
              <ul className="rgroup__items disclosure__body">
                {effByName.map((it) => (
                  <li key={`${it.ingredientId}|${it.unit}`} className="rgroup__item">
                    <span className="rgroup__item-name">
                      {byId.get(it.ingredientId)?.name ?? 'Unknown item'}
                    </span>
                    <span className="rows__meta">{formatAmount(it.quantity, it.unit)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {saveError && <p className="flash flash--error">{saveError}</p>}
        </div>
      </div>

      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={create}
          disabled={!writeAccess || busy || effective.length === 0}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          {busy ? 'Creating…' : 'Create list'}
        </button>
        <button className="btn" onClick={discard} disabled={busy}>
          Discard
        </button>
      </div>
    </div>
  )
}
