import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { DATA_PATHS } from '../github/data'
import type { ShoppingList } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { ErrorNote, Loading, ReadOnlyBanner } from '../components/ui'

const NAV = [
  { to: '/lists/new', label: 'Build a list', hint: 'Start a new shopping list', primary: true },
  { to: '/lists', label: 'Lists', hint: 'Active & past lists' },
  { to: '/recipes', label: 'Recipes', hint: 'Ingredient bundles' },
  { to: '/templates', label: 'Templates', hint: 'List starting points' },
  { to: '/ingredients', label: 'Ingredients', hint: 'Your catalog' },
]

export function Home() {
  const { repo } = useAuth()
  const { data, loading, error, reload } = useCollection<ShoppingList>(DATA_PATHS.lists)
  const active = data ? data.filter((l) => l.status === 'active') : []

  return (
    <div className="stack">
      <div className="hero">
        <h1 className="hero__title">Shopping</h1>
        {repo && <p className="muted">{repo.full_name}</p>}
      </div>
      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {active.length > 0 && (
        <section>
          <h2 className="section">Resume shopping</h2>
          <ul className="rows rows--cards">
            {active.map((l) => {
              const done = l.items.filter((i) => i.bought).length
              return (
                <li key={l.id}>
                  <Link to={`/lists/${l.id}`} className="listcard">
                    <div className="listcard__top">
                      <span className="rows__main">{l.name}</span>
                      <span className="rows__meta">
                        {done}/{l.items.length}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="tiles">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`tile ${n.primary ? 'tile--primary' : ''}`}>
            <span className="tile__label">{n.label}</span>
            <span className="tile__hint">{n.hint}</span>
          </Link>
        ))}
      </section>
    </div>
  )
}
