import { Link } from 'react-router'
import { DATA_PATHS } from '../github/data'
import { DEFAULT_UNIT, listProgress, migrateList, type ShoppingList } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { EmptyState, ErrorNote, Loading, ReadOnlyBanner } from '../components/ui'

function ActiveCard({ list }: { list: ShoppingList }) {
  const { done, total } = listProgress(migrateList(list, () => DEFAULT_UNIT))
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <li>
      <Link to={`/lists/${list.id}`} className="listcard">
        <div className="listcard__top">
          <span className="rows__main">{list.name}</span>
          <span className="rows__meta">
            {done}/{total}
          </span>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${pct}%` }} />
        </div>
      </Link>
    </li>
  )
}

export function Home() {
  const { data, loading, error, reload } = useCollection<ShoppingList>(DATA_PATHS.lists)
  const active = data ? data.filter((l) => l.status === 'active') : []
  const ready = data && !loading && !error

  return (
    <div className="stack">
      <div className="hero">
        <h1 className="hero__title">Welcome back 👋</h1>
        {ready && active.length > 0 && (
          <p className="muted">Pick up where you left off.</p>
        )}
      </div>

      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {ready && active.length > 0 && (
        <>
          <section>
            <h2 className="section">Active lists</h2>
            <ul className="rows rows--cards">
              {active.map((l) => (
                <ActiveCard key={l.id} list={l} />
              ))}
            </ul>
          </section>

          <Link to="/lists/new" className="btn btn--primary btn--block">
            New list
          </Link>
        </>
      )}

      {ready && active.length === 0 && (
        <EmptyState
          title="No active lists"
          hint="Nothing on the go right now — start a fresh shopping list whenever you're ready."
          action={
            <Link to="/lists/new" className="btn btn--primary">
              New list
            </Link>
          }
        />
      )}
    </div>
  )
}
