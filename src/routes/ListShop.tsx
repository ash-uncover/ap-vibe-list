import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { appendOp, ConflictError, DATA_PATHS, removeOp, upsertOp } from '../github/data'
import {
  boughtKey,
  DEFAULT_UNIT,
  effectiveItems,
  formatAmount,
  ingredientLabelNames,
  migrateList,
  normalizeItem,
  type AttachedRecipe,
  type Bundle,
  type Ingredient,
  type Item,
  type Label,
  type ShoppingList,
} from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { IngredientPicker } from '../components/IngredientPicker'
import { RecipeGroups } from '../components/RecipeGroups'
import { Chip, CONFLICT_MSG, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'
import { clearDraft, draftShopKey, getDraft, setDraft } from '../storage/drafts'

interface Working {
  items: Item[]
  recipes: AttachedRecipe[]
  bought: string[]
}

export function ListShop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { client, writeAccess } = useAuth()

  const lists = useCollection<ShoppingList>(DATA_PATHS.lists)
  const recipes = useCollection<Bundle>(DATA_PATHS.recipes)
  const ingredients = useCollection<Ingredient>(DATA_PATHS.ingredients)
  const labels = useCollection<Label>(DATA_PATHS.labels)

  const initialDraft = useMemo<Working | null>(() => {
    if (!id) return null
    const d = getDraft<Working>(draftShopKey(id))
    return d && Array.isArray(d.items) && Array.isArray(d.recipes) && Array.isArray(d.bought)
      ? d
      : null
  }, [id])
  const [working, setWorking] = useState<Working | null>(initialDraft)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const rawList = lists.data?.find((l) => l.id === id)

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i] as const)),
    [ingredients.data],
  )
  const labelsById = useMemo(
    () => new Map((labels.data ?? []).map((l) => [l.id, l] as const)),
    [labels.data],
  )
  const unitFor = (ingredientId: string) => byId.get(ingredientId)?.defaultUnit ?? DEFAULT_UNIT

  // Seed working state from the committed list once both it and the catalog load.
  useEffect(() => {
    if (working !== null || !rawList || !ingredients.data) return
    const list = migrateList(rawList, unitFor)
    setWorking({ items: list.items, recipes: list.recipes, bought: list.bought })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawList, working, ingredients.data])

  // Migrate a restored draft that may still use the old item shape.
  const normalized = useRef(false)
  useEffect(() => {
    if (normalized.current || working === null || !ingredients.data) return
    normalized.current = true
    setWorking((w) =>
      w
        ? {
            ...w,
            items: w.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
            recipes: w.recipes.map((g) => ({
              ...g,
              items: g.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
            })),
          }
        : w,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, ingredients.data])

  // Persist in-progress ticks/edits so a refresh is safe — this is NOT a commit.
  useEffect(() => {
    if (working && id) setDraft(draftShopKey(id), working)
  }, [working, id])

  function toggle(key: string) {
    setWorking((w) =>
      w
        ? {
            ...w,
            bought: w.bought.includes(key)
              ? w.bought.filter((k) => k !== key)
              : [...w.bought, key],
          }
        : w,
    )
  }

  function attachRecipe(bundle: Bundle | undefined) {
    if (!bundle) return
    setWorking((w) => {
      if (!w || w.recipes.some((g) => g.recipeId === bundle.id)) return w
      const group: AttachedRecipe = {
        recipeId: bundle.id,
        name: bundle.name,
        items: bundle.items.map((r) => normalizeItem(r, unitFor(r.ingredientId))),
      }
      return { ...w, recipes: [...w.recipes, group] }
    })
  }

  function detachRecipe(recipeId: string) {
    setWorking((w) => (w ? { ...w, recipes: w.recipes.filter((g) => g.recipeId !== recipeId) } : w))
  }

  /** A write collided with a concurrent change: show the latest list and explain. */
  function applyLatestConflict(e: ConflictError) {
    const freshRaw = (e.latest.items as ShoppingList[]).find((l) => l.id === id)
    if (freshRaw) {
      const fresh = migrateList(freshRaw, unitFor)
      setWorking({ items: fresh.items, recipes: fresh.recipes, bought: fresh.bought })
      setSaveError(CONFLICT_MSG)
    } else {
      setSaveError('This list was deleted in the repository.')
    }
  }

  async function commit(status: ShoppingList['status'], verb: string) {
    if (!client || !lists.data || !rawList || !working) return
    setBusy(true)
    setSaveError(null)
    try {
      const base = migrateList(rawList, unitFor)
      const updated: ShoppingList = {
        id: base.id,
        name: base.name,
        createdAt: base.createdAt,
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : undefined,
        items: working.items,
        recipes: working.recipes,
        bought: working.bought,
      }
      await lists.commit(upsertOp(updated, rawList), `${verb}: ${base.name}`)
      if (status === 'completed') {
        if (id) clearDraft(draftShopKey(id))
        navigate('/lists')
      }
      // Otherwise the shared cache already holds `updated` — nothing to reload.
    } catch (e) {
      if (e instanceof ConflictError) applyLatestConflict(e)
      else setSaveError((e as GitHubError).message ?? 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!client || !lists.data || !rawList) return
    if (!confirm(`Delete “${rawList.name}”?`)) return
    setBusy(true)
    setSaveError(null)
    try {
      await lists.commit(removeOp(rawList.id, rawList), `Delete list: ${rawList.name}`)
      if (id) clearDraft(draftShopKey(id))
      navigate('/lists')
    } catch (e) {
      if (e instanceof ConflictError) applyLatestConflict(e)
      else setSaveError((e as GitHubError).message ?? 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  if (lists.loading || ingredients.loading || recipes.loading || labels.loading) return <Loading />
  if (lists.error) return <ErrorNote error={lists.error} onRetry={lists.reload} />
  if (lists.data && !rawList) return <ErrorNote error="This list no longer exists." />
  if (!working || !rawList) return <Loading />

  const boughtSet = new Set(working.bought)
  const effective = effectiveItems(working.items, working.recipes).sort((a, b) =>
    (byId.get(a.ingredientId)?.name ?? '').localeCompare(byId.get(b.ingredientId)?.name ?? ''),
  )
  const done = effective.filter((e) => boughtSet.has(boughtKey(e.ingredientId, e.unit))).length
  const attachable = (recipes.data ?? []).filter(
    (r) => !working.recipes.some((g) => g.recipeId === r.id),
  )

  return (
    <div className="stack">
      <PageHead title={rawList.name} />
      <ReadOnlyBanner />

      <div className="shop__status">
        <span className="rows__meta">
          {done}/{effective.length} bought
        </span>
        <span
          className={`badge ${rawList.status === 'completed' ? 'badge--green' : 'badge--gray'}`}
        >
          {rawList.status}
        </span>
      </div>

      {effective.length === 0 ? (
        <p className="muted">This list is empty. Add items or a recipe below.</p>
      ) : (
        <ul className="checklist">
          {effective.map((it) => {
            const key = boughtKey(it.ingredientId, it.unit)
            const ing = byId.get(it.ingredientId)
            const bought = boughtSet.has(key)
            const chips = ing ? ingredientLabelNames(ing, labelsById) : []
            return (
              <li key={key}>
                <label className={`check ${bought ? 'is-bought' : ''}`}>
                  <input type="checkbox" checked={bought} onChange={() => toggle(key)} />
                  <span className="check__name">{ing?.name ?? 'Unknown item'}</span>
                  <span className="check__amount">{formatAmount(it.quantity, it.unit)}</span>
                  {chips.length > 0 && (
                    <span className="check__chips">
                      {chips.map((l) => (
                        <Chip key={l}>{l}</Chip>
                      ))}
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <details className="disclosure">
        <summary>Edit list</summary>
        <div className="disclosure__body stack">
          <div className="field">
            <span className="field__label">Your items</span>
            <IngredientPicker
              catalog={ingredients.data ?? []}
              items={working.items}
              onChange={(items) => setWorking((w) => (w ? { ...w, items } : w))}
              onCreate={(ing) => ingredients.commit(appendOp(ing), `Add ingredient: ${ing.name}`)}
            />
          </div>

          {attachable.length > 0 && (
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
                {attachable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          {working.recipes.length > 0 && (
            <RecipeGroups
              recipes={working.recipes}
              catalog={ingredients.data ?? []}
              onDetach={detachRecipe}
            />
          )}
        </div>
      </details>

      {saveError && <p className="flash flash--error">{saveError}</p>}

      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={() => commit('completed', 'Complete shopping')}
          disabled={!writeAccess || busy}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          {busy ? 'Saving…' : 'Mark completed'}
        </button>
        <button
          className="btn"
          onClick={() => commit(rawList.status, 'Save list')}
          disabled={!writeAccess || busy}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          Save
        </button>
        {rawList.status === 'completed' && (
          <button
            className="btn"
            onClick={() => commit('active', 'Reopen list')}
            disabled={!writeAccess || busy}
          >
            Reopen
          </button>
        )}
        <button
          className="btn btn--danger"
          onClick={remove}
          disabled={!writeAccess || busy}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
