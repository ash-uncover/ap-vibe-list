import { Link } from 'react-router'
import { DATA_PATHS } from '../github/data'
import type { ShoppingList } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { EmptyState, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

function progress(list: ShoppingList): { done: number; total: number } {
  return { done: list.items.filter((i) => i.bought).length, total: list.items.length }
}

function ListCard({ list }: { list: ShoppingList }) {
  const { done, total } = progress(list)
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <li>
      <Link to={`/lists/${list.id}`} className="listcard">
        <div className="listcard__top">
          <span className="rows__main">{list.name}</span>
          <span className={`badge ${list.status === 'completed' ? 'badge--green' : 'badge--gray'}`}>
            {list.status === 'completed' ? 'completed' : 'active'}
          </span>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${pct}%` }} />
        </div>
        <span className="rows__meta">
          {done}/{total} bought
        </span>
      </Link>
    </li>
  )
}

export function ListsList() {
  const { data, loading, error, reload } = useCollection<ShoppingList>(DATA_PATHS.lists)

  const active = data ? data.filter((l) => l.status === 'active') : []
  const completed = data ? data.filter((l) => l.status === 'completed') : []

  return (
    <div className="stack">
      <PageHead
        title="Lists"
        action={
          <Link to="/lists/new" className="btn btn--primary btn--sm">
            New list
          </Link>
        }
      />
      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && !loading && !error && data.length === 0 && (
        <EmptyState
          title="No lists yet"
          hint="Build a shopping list from ingredients, a template, recipes, or a past list."
          action={
            <Link to="/lists/new" className="btn btn--primary">
              Build a list
            </Link>
          }
        />
      )}

      {active.length > 0 && (
        <>
          <h2 className="section">Active</h2>
          <ul className="rows rows--cards">
            {active.map((l) => (
              <ListCard key={l.id} list={l} />
            ))}
          </ul>
        </>
      )}

      {completed.length > 0 && (
        <>
          <h2 className="section">Completed</h2>
          <ul className="rows rows--cards">
            {completed.map((l) => (
              <ListCard key={l.id} list={l} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
