import { Link } from 'react-router'
import { DATA_PATHS } from '../github/data'
import type { Bundle, BundleKind } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { EmptyState, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

interface Props {
  kind: BundleKind
}

const COPY = {
  recipe: {
    path: DATA_PATHS.recipes,
    base: '/recipes',
    title: 'Recipes',
    emptyTitle: 'No recipes yet',
    emptyHint: 'A recipe is a set of ingredients that go together. Pick it when building a list and it pours its ingredients in.',
  },
  template: {
    path: DATA_PATHS.templates,
    base: '/templates',
    title: 'Templates',
    emptyTitle: 'No templates yet',
    emptyHint: 'A template is a starting point for a list — e.g. “Weekly Grocery”. Seed a new list from it.',
  },
} as const

export function BundlesList({ kind }: Props) {
  const copy = COPY[kind]
  const { data, loading, error, reload } = useCollection<Bundle>(copy.path)

  const bundles = data
    ? [...data].filter((b) => b.kind === kind).sort((a, b) => a.name.localeCompare(b.name))
    : []

  return (
    <div className="stack">
      <PageHead
        title={copy.title}
        action={
          <Link to={`${copy.base}/new`} className="btn btn--primary btn--sm">
            New
          </Link>
        }
      />
      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && !loading && !error && (
        bundles.length === 0 ? (
          <EmptyState
            title={copy.emptyTitle}
            hint={copy.emptyHint}
            action={
              <Link to={`${copy.base}/new`} className="btn btn--primary">
                Create one
              </Link>
            }
          />
        ) : (
          <ul className="rows">
            {bundles.map((b) => (
              <li key={b.id}>
                <Link to={`${copy.base}/${b.id}`} className="rows__item">
                  <span className="rows__main">{b.name}</span>
                  <span className="rows__meta">
                    {b.items.length} item{b.items.length === 1 ? '' : 's'}
                  </span>
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
