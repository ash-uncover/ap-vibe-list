import { Link } from 'react-router'
import { DATA_PATHS } from '../github/data'
import type { Ingredient } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { Chip, EmptyState, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

export function IngredientsList() {
  const { data, loading, error, reload } = useCollection<Ingredient>(DATA_PATHS.ingredients)

  const sorted = data
    ? [...data].sort((a, b) => a.name.localeCompare(b.name))
    : []

  return (
    <div className="stack">
      <PageHead
        title="Ingredients"
        action={
          <Link to="/ingredients/new" className="btn btn--primary btn--sm">
            New
          </Link>
        }
      />
      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && !loading && !error && (
        sorted.length === 0 ? (
          <EmptyState
            title="No ingredients yet"
            hint="Add the things you buy — they become the building blocks for recipes and lists."
            action={
              <Link to="/ingredients/new" className="btn btn--primary">
                Add your first ingredient
              </Link>
            }
          />
        ) : (
          <ul className="rows">
            {sorted.map((i) => (
              <li key={i.id}>
                <Link to={`/ingredients/${i.id}`} className="rows__item">
                  <span className="rows__main">{i.name}</span>
                  {i.labels.length > 0 && (
                    <span className="rows__chips">
                      {i.labels.map((l) => (
                        <Chip key={l}>{l}</Chip>
                      ))}
                    </span>
                  )}
                  <span className="rows__chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
