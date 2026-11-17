import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import {
  DEFAULT_UNIT,
  newId,
  normalizeItem,
  type Bundle,
  type Ingredient,
  type Item,
  type ShoppingList,
} from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { IngredientPicker } from '../components/IngredientPicker'
import { ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'
import { clearDraft, DRAFT_NEW_LIST, getDraft, setDraft } from '../storage/drafts'

interface Draft {
  name: string
  items: Item[]
}

/** Merge item lists, summing quantities of the same ingredient in the same unit. */
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

  const initial = useMemo(() => getDraft<Draft>(DRAFT_NEW_LIST), [])
  const [draft, setDraftState] = useState<Draft>(initial ?? { name: '', items: [] })
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const cloneApplied = useRef(initial != null)

  // Persist working state so a refresh never loses it.
  useEffect(() => {
    setDraft(DRAFT_NEW_LIST, draft)
  }, [draft])

  // Clone from a past list (unbought items) when arriving via ?from and no draft exists.
  useEffect(() => {
    if (cloneApplied.current || !fromId || !lists.data) return
    const src = lists.data.find((l) => l.id === fromId)
    if (src) {
      const defaults = new Map((ingredients.data ?? []).map((i) => [i.id, i.defaultUnit] as const))
      setDraftState({
        name: `${src.name} (copy)`,
        items: src.items
          .filter((i) => !i.bought)
          .map((r) => normalizeItem(r, defaults.get(r.ingredientId) ?? DEFAULT_UNIT)),
      })
    }
    cloneApplied.current = true
  }, [fromId, lists.data, ingredients.data])

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i] as const)),
    [ingredients.data],
  )

  // One-time migration of a restored draft that may still use the old amount shape.
  const normalizedDraft = useRef(false)
  useEffect(() => {
    if (normalizedDraft.current || !ingredients.data) return
    normalizedDraft.current = true
    setDraftState((d) => ({
      ...d,
      items: d.items.map((r) => normalizeItem(r, byId.get(r.ingredientId)?.defaultUnit ?? DEFAULT_UNIT)),
    }))
  }, [ingredients.data, byId])

  function applyBundle(bundle: Bundle | undefined) {
    if (!bundle) return
    const norm = bundle.items.map((r) =>
      normalizeItem(r, byId.get(r.ingredientId)?.defaultUnit ?? DEFAULT_UNIT),
    )
    setDraftState((d) => ({ ...d, items: mergeItems(d.items, norm) }))
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
        items: draft.items.map((i) => ({ ...i, bought: false })),
      }
      await writeJson(
        client,
        DATA_PATHS.lists,
        [...lists.data, list],
        `Create list: ${list.name}`,
      )
      clearDraft(DRAFT_NEW_LIST)
      navigate(`/lists/${list.id}`)
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Could not create the list.')
      setBusy(false)
    }
  }

  function discard() {
    clearDraft(DRAFT_NEW_LIST)
    setDraftState({ name: '', items: [] })
  }

  const anyLoading =
    lists.loading || templates.loading || recipes.loading || ingredients.loading
  const anyError = lists.error || templates.error || recipes.error || ingredients.error
  if (anyLoading) return <Loading />
  if (anyError) return <ErrorNote error={anyError} onRetry={() => { lists.reload(); templates.reload(); recipes.reload(); ingredients.reload() }} />

  const templateList = templates.data ?? []
  const recipeList = recipes.data ?? []

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
                  applyBundle(templateList.find((t) => t.id === e.target.value))
                  e.target.value = ''
                }}
              >
                <option value="">Choose a template…</option>
                {templateList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          {recipeList.length > 0 && (
            <label className="field">
              <span className="field__label">Add a recipe</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  applyBundle(recipeList.find((r) => r.id === e.target.value))
                  e.target.value = ''
                }}
              >
                <option value="">Add a recipe’s ingredients…</option>
                {recipeList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="field">
            <span className="field__label">
              Items {draft.items.length > 0 && `(${draft.items.length})`}
            </span>
            <IngredientPicker
              catalog={ingredients.data ?? []}
              items={draft.items}
              onChange={(items) => setDraftState((d) => ({ ...d, items }))}
              onCatalogChange={ingredients.reload}
            />
          </div>

          {saveError && <p className="flash flash--error">{saveError}</p>}
        </div>
      </div>

      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={create}
          disabled={!writeAccess || busy || draft.items.length === 0}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          {busy ? 'Creating…' : 'Create list'}
        </button>
        <button className="btn" onClick={discard} disabled={busy}>
          Discard
        </button>
      </div>
      {byId.size === 0 && (
        <p className="muted">No ingredients in the catalog yet — add some as you go.</p>
      )}
    </div>
  )
}
