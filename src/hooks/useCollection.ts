import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { readJson } from '../github/data'
import type { GitHubError } from '../github/types'

export interface CollectionState<T> {
  data: T[] | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Load a JSON collection from the repo, with reload. Read-only tokens work fine here. */
export function useCollection<T>(path: string): CollectionState<T> {
  const { client } = useAuth()
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      setData(await readJson<T>(client, path))
    } catch (e) {
      setError((e as GitHubError).message ?? 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [client, path])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}
