import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { commitJson, ConflictError, loadJson, type Loaded } from '../github/data'
import { useRepoData } from '../github/RepoData'
import type { GitHubError } from '../github/types'

export interface CollectionState<T> {
  data: T[] | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Optimistic write: `apply` transforms the current array into the one to persist, or
   * returns `null` to signal a conflict. Resolves once committed (the shared cache and head
   * marker are updated); rejects with ConflictError (after refreshing the cache to the
   * repo's latest) when the change clashes with a concurrent edit.
   */
  commit: (apply: (current: T[]) => T[] | null, message: string) => Promise<void>
}

/**
 * Load a JSON collection from the repo, backed by the app-wide RepoData cache. Across
 * navigations the cache is served without refetching; a reload only happens when the repo's
 * head commit moves (see useRepoFreshness) or on an explicit reload()/commit().
 */
export function useCollection<T>(path: string): CollectionState<T> {
  const { client } = useAuth()
  const { headSha, peek, store, advance } = useRepoData()

  const entry = peek(path)
  const data = (entry?.loaded.items as T[] | undefined) ?? null
  const isFresh = entry != null && entry.atHead === headSha

  const [loading, setLoading] = useState(!isFresh)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      store(path, await loadJson<T>(client, path))
    } catch (e) {
      setError((e as GitHubError).message ?? 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [client, path, store])

  // Fetch when the collection is missing or stale (head moved); otherwise serve the cache.
  useEffect(() => {
    if (!client) return
    const cur = peek(path)
    if (cur && cur.atHead === headSha) {
      setLoading(false)
      return
    }
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, path, headSha])

  const commit = useCallback(
    async (apply: (current: T[]) => T[] | null, message: string) => {
      if (!client) throw new Error('Not authenticated.')
      const base = (peek(path)?.loaded as Loaded<T> | undefined) ?? { items: [], sha: null }
      try {
        const { loaded, commitSha } = await commitJson<T>(client, path, base, apply, message)
        advance(path, loaded, commitSha)
      } catch (e) {
        if (e instanceof ConflictError) store(path, e.latest)
        throw e
      }
    },
    [client, path, peek, store, advance],
  )

  return { data, loading, error, reload, commit }
}
