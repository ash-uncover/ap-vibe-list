import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS, writeJson } from '../github/data'
import type { Ingredient, Item, ListItem, ShoppingList } from '../github/model'
import type { GitHubError } from '../github/types'
import { useCollection } from '../hooks/useCollection'
import { IngredientPicker } from '../components/IngredientPicker'
import { Chip, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'
import { clearDraft, draftShopKey, getDraft, setDraft } from '../storage/drafts'

export function ListShop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { client, writeAccess } = useAuth()

  const lists = useCollection<ShoppingList>(DATA_PATHS.lists)
  const ingredients = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const initialDraft = useMemo(
    () => (id ? getDraft<ListItem[]>(draftShopKey(id)) : null),
    [id],
  )
  const [working, setWorking] = useState<ListItem[] | null>(initialDraft)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const list = lists.data?.find((l) => l.id === id)

  // Seed working state from the committed list the first time it loads.
  useEffect(() => {
    if (working !== null || !list) return
    setWorking(list.items)
  }, [list, working])

  // Persist in-progress ticks so a refresh is safe — this is NOT a commit.
  useEffect(() => {
    if (working && id) setDraft(draftShopKey(id), working)
  }, [working, id])

  const byId = useMemo(
    () => new Map((ingredients.data ?? []).map((i) => [i.id, i] as const)),
    [ingredients.data],
  )

  function toggle(ingredientId: string) {
    setWorking((w) =>
      (w ?? []).map((it) =>
        it.ingredientId === ingredientId ? { ...it, bought: !it.bought } : it,
      ),
    )
  }

  function onItemsChange(items: Item[]) {
    const bought = new Map((working ?? []).map((w) => [w.ingredientId, w.bought] as const))
    setWorking(items.map((i) => ({ ...i, bought: bought.get(i.ingredientId) ?? false })))
  }

  async function commit(items: ListItem[], status: ShoppingList['status'], verb: string) {
    if (!client || !lists.data || !list) return
    setBusy(true)
    setSaveError(null)
    try {
      const updated: ShoppingList = {
        ...list,
        items,
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : undefined,
      }
      await writeJson(
        client,
        DATA_PATHS.lists,
        lists.data.map((l) => (l.id === list.id ? updated : l)),
        `${verb}: ${list.name}`,
      )
      if (id) clearDraft(draftShopKey(id))
      if (status === 'completed') navigate('/lists')
      else {
        setWorking(items)
        await lists.reload()
      }
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!client || !lists.data || !list) return
    if (!confirm(`Delete “${list.name}”?`)) return
    setBusy(true)
    setSaveError(null)
    try {
      await writeJson(
        client,
        DATA_PATHS.lists,
        lists.data.filter((l) => l.id !== list.id),
        `Delete list: ${list.name}`,
      )
      if (id) clearDraft(draftShopKey(id))
      navigate('/lists')
    } catch (e) {
      setSaveError((e as GitHubError).message ?? 'Delete failed.')
      setBusy(false)
    }
  }

  if (lists.loading || ingredients.loading) return <Loading />
  if (lists.error) return <ErrorNote error={lists.error} onRetry={lists.reload} />
  if (lists.data && !list) return <ErrorNote error="This list no longer exists." />
  if (!working || !list) return <Loading />

  const done = working.filter((i) => i.bought).length
  const total = working.length
  const pickerItems: Item[] = working.map(({ ingredientId, amount }) => ({ ingredientId, amount }))

  return (
    <div className="stack">
      <PageHead title={list.name} />
      <ReadOnlyBanner />

      <div className="shop__status">
        <span className="rows__meta">
          {done}/{total} bought
        </span>
        <span className={`badge ${list.status === 'completed' ? 'badge--green' : 'badge--gray'}`}>
          {list.status}
        </span>
      </div>

      {total === 0 ? (
        <p className="muted">This list is empty. Add items below.</p>
      ) : (
        <ul className="checklist">
          {working.map((it) => {
            const ing = byId.get(it.ingredientId)
            return (
              <li key={it.ingredientId}>
                <label className={`check ${it.bought ? 'is-bought' : ''}`}>
                  <input
                    type="checkbox"
                    checked={it.bought}
                    onChange={() => toggle(it.ingredientId)}
                  />
                  <span className="check__name">{ing?.name ?? 'Unknown item'}</span>
                  {it.amount && <span className="check__amount">{it.amount}</span>}
                  {ing && ing.labels.length > 0 && (
                    <span className="check__chips">
                      {ing.labels.map((l) => (
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
        <summary>Add or edit items</summary>
        <div className="disclosure__body">
          <IngredientPicker
            catalog={ingredients.data ?? []}
            items={pickerItems}
            onChange={onItemsChange}
            onCatalogChange={ingredients.reload}
          />
        </div>
      </details>

      {saveError && <p className="flash flash--error">{saveError}</p>}

      <div className="actions">
        <button
          className="btn btn--primary"
          onClick={() => commit(working, 'completed', 'Complete shopping')}
          disabled={!writeAccess || busy}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          {busy ? 'Saving…' : 'Mark completed'}
        </button>
        <button
          className="btn"
          onClick={() => commit(working, list.status, 'Save list')}
          disabled={!writeAccess || busy}
          title={writeAccess ? undefined : 'Read-only token'}
        >
          Save
        </button>
        {list.status === 'completed' && (
          <button
            className="btn"
            onClick={() => commit(working, 'active', 'Reopen list')}
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
