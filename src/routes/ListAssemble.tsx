import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import {
  boughtKey,
  DEFAULT_UNIT,
  effectiveItems,
  formatAmount,
  migrateList,
  newId,
  normalizeItem,
  unitShort,
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

interface ReviewState {
  items: Item[]
  bought: string[]
}

/** What we persist to localStorage: the draft plus, once reached, the review state. */
interface PersistedDraft extends Draft {
  review?: ReviewState | null
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

  const initial = useMemo<PersistedDraft | null>(() => {
    const d = getDraft<Partial<PersistedDraft>>(DRAFT_NEW_LIST)
    if (!d) return null
    const review =
      d.review && Array.isArray(d.review.items) && Array.isArray(d.review.bought)
        ? { items: d.review.items, bought: d.review.bought }
        : null
    return { name: d.name ?? '', items: d.items ?? [], recipes: d.recipes ?? [], review }
  }, [])
  const [draft, setDraftState] = useState<Draft>(
    initial
      ? { name: initial.name, items: initial.items, recipes: initial.recipes }
      : { name: '', items: [], recipes: [] },
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const cloneApplied = useRef(initial != null)

  // The flattened, ingredient-only list the user confirms before the list is created.
  const [review, setReview] = useState<ReviewState | null>(initial?.review ?? null)

  // Step 1 is picking a template (one or none). Skip it when resuming a draft that
  // already has content, or when cloning from a past list; jump straight to the review
  // step when a persisted review is being restored.
  const resuming =
    initial != null &&
    (initial.name.trim() !== '' || initial.items.length > 0 || initial.recipes.length > 0)
  const [step, setStep] = useState<'template' | 'build' | 'review'>(
    initial?.review ? 'review' : fromId || resuming ? 'build' : 'template',
  )

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i] as const)),
    [ingredients.data],
  )
  const unitFor = (id: string) => byId.get(id)?.defaultUnit ?? DEFAULT_UNIT

  // Persist working state so a refresh never loses it.
  useEffect(() => {
    setDraft(DRAFT_NEW_LIST, { ...draft, review })
  }, [draft, review])

  // Nothing to choose from: advance straight to the builder.
  useEffect(() => {
    if (step !== 'template' || templates.loading || templates.error) return
    if ((templates.data?.length ?? 0) === 0) setStep('build')
  }, [step, templates.loading, templates.error, templates.data])

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

  /** Step 1 choice: seed the draft from a template (or start blank) and move to the builder. */
  function pickTemplate(bundle: Bundle | undefined) {
    if (bundle) {
      const items = bundle.items.map((r) => normalizeItem(r, unitFor(r.ingredientId)))
      setDraftState({
        name: `${bundle.name} - ${new Date().toLocaleDateString()}`,
        items,
        recipes: [],
      })
    }
    setStep('build')
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

  /** Leave the builder: flatten to the final ingredient-only list and show it for review. */
  function goReview() {
    const items = effectiveItems(draft.items, draft.recipes).sort((a, b) =>
      (byId.get(a.ingredientId)?.name ?? '').localeCompare(byId.get(b.ingredientId)?.name ?? ''),
    )
    setReview({ items, bought: [] })
    setSaveError(null)
    setStep('review')
  }

  /** Return to the builder, dropping the (recomputed-on-next-review) confirmation state. */
  function backToBuild() {
    setReview(null)
    setStep('build')
  }

  function setReviewQty(index: number, quantity: number) {
    setReview((r) =>
      r
        ? { ...r, items: r.items.map((it, i) => (i === index ? { ...it, quantity } : it)) }
        : r,
    )
  }

  function toggleReviewBought(key: string) {
    setReview((r) =>
      r
        ? {
            ...r,
            bought: r.bought.includes(key)
              ? r.bought.filter((k) => k !== key)
              : [...r.bought, key],
          }
        : r,
    )
  }

  async function create() {
    if (!client || !lists.data || !review) return
    setBusy(true)
    setSaveError(null)
    try {
      const items = review.items.filter((it) => it.quantity > 0)
      const keys = new Set(items.map((it) => boughtKey(it.ingredientId, it.unit)))
      const list: ShoppingList = {
        id: newId(),
        name: draft.name.trim() || 'Shopping list',
        status: 'active',
        createdAt: new Date().toISOString(),
        items,
        recipes: [],
        bought: review.bought.filter((k) => keys.has(k)),
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
    setReview(null)
    setStep((templates.data?.length ?? 0) > 0 ? 'template' : 'build')
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

  // Step 1 — choose a template (or start blank).
  if (step === 'template') {
    return (
      <div className="stack">
        <PageHead title="New list" />
        <ReadOnlyBanner />

        <div className="box">
          <div className="box__body">
            <span className="field__label">Choose a starting point</span>
            <ul className="rows rows--cards">
              <li>
                <button type="button" className="listcard" onClick={() => pickTemplate(undefined)}>
                  <div className="listcard__top">
                    <span className="rows__main">Blank list</span>
                    <span className="rows__meta">Start from scratch</span>
                  </div>
                </button>
              </li>
              {templateList.map((t) => (
                <li key={t.id}>
                  <button type="button" className="listcard" onClick={() => pickTemplate(t)}>
                    <div className="listcard__top">
                      <span className="rows__main">{t.name}</span>
                      <span className="rows__meta">{t.items.length} items</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Step 3 — review the final ingredient-only list before creating it.
  if (step === 'review' && review) {
    const reviewBought = new Set(review.bought)
    const canCreate = review.items.some((it) => it.quantity > 0)
    return (
      <div className="stack">
        <PageHead title="Review list" />
        <ReadOnlyBanner />

        <button type="button" className="btn btn--sm" onClick={backToBuild}>
          ← Back to editing
        </button>

        <p className="muted">
          {draft.name.trim() || 'Shopping list'} — adjust quantities or tick anything you
          already have.
        </p>

        <div className="box">
          <div className="box__body">
            {review.items.length === 0 ? (
              <p className="muted">This list is empty.</p>
            ) : (
              <ul className="checklist">
                {review.items.map((it, i) => {
                  const key = boughtKey(it.ingredientId, it.unit)
                  const ing = byId.get(it.ingredientId)
                  const bought = reviewBought.has(key)
                  return (
                    <li key={key}>
                      <div className={`review-row ${bought ? 'is-bought' : ''}`}>
                        <input
                          type="checkbox"
                          className="review-row__check"
                          checked={bought}
                          onChange={() => toggleReviewBought(key)}
                          aria-label="Already have this"
                        />
                        <span className="review-row__name">{ing?.name ?? 'Unknown item'}</span>
                        <input
                          className="input input--qty"
                          type="number"
                          min="0"
                          step="any"
                          value={Number.isFinite(it.quantity) ? it.quantity : ''}
                          onChange={(e) => setReviewQty(i, Number(e.target.value) || 0)}
                          aria-label="Quantity"
                        />
                        <span className="rows__unit">{unitShort(it.unit)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {saveError && <p className="flash flash--error">{saveError}</p>}
          </div>
        </div>

        <div className="actions">
          <button
            className="btn btn--primary"
            onClick={create}
            disabled={!writeAccess || busy || !canCreate}
            title={writeAccess ? undefined : 'Read-only token'}
          >
            {busy ? 'Creating…' : 'Create list'}
          </button>
          <button className="btn" onClick={backToBuild} disabled={busy}>
            Back
          </button>
        </div>
      </div>
    )
  }

  // Step 2 — assemble the list.
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

      {templateList.length > 0 && (
        <button type="button" className="btn btn--sm" onClick={() => setStep('template')}>
          ← Choose a different starting point
        </button>
      )}

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
          onClick={goReview}
          disabled={!writeAccess || effective.length === 0}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          Review list
        </button>
        <button className="btn" onClick={discard}>
          Discard
        </button>
      </div>
    </div>
  )
}
