import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { Loaded } from './data'

interface CacheEntry {
  loaded: Loaded<unknown>
  atHead: string | null
}

interface RepoDataValue {
  /** Latest known repo head commit sha; null when unknown (e.g. demo mode). */
  headSha: string | null
  setHead: (sha: string | null) => void
  /** Read a cached collection, or undefined if never loaded. */
  peek: (path: string) => CacheEntry | undefined
  /** Store a freshly loaded collection, stamped at the current head. */
  store: (path: string, loaded: Loaded<unknown>) => void
  /**
   * Record our own successful write: update `path`, advance the head to the resulting
   * commit, and re-stamp every cached entry to that head. Because our commit only touched
   * `path`, the other collections stay valid — this prevents a write from needlessly
   * invalidating siblings (or the written file itself) and refetching them.
   */
  advance: (path: string, loaded: Loaded<unknown>, commitSha: string | null) => void
}

const RepoDataContext = createContext<RepoDataValue | null>(null)

/**
 * App-wide store that lets collections survive navigation and be revalidated by commit
 * sha rather than refetched on every screen. One cache entry per data path, each tagged
 * with the head sha it was loaded at; an entry is stale once the head moves past it.
 */
export function RepoDataProvider({ children }: { children: ReactNode }) {
  const [headSha, setHeadState] = useState<string | null>(null)
  const headRef = useRef<string | null>(null) // mirror of headSha for synchronous stamping
  const cache = useRef(new Map<string, CacheEntry>())
  const [, tick] = useState(0) // bump so consumers re-read the cache after a store

  const setHead = useCallback((sha: string | null) => {
    headRef.current = sha
    setHeadState((prev) => (prev === sha ? prev : sha))
  }, [])

  const peek = useCallback((path: string) => cache.current.get(path), [])

  const store = useCallback((path: string, loaded: Loaded<unknown>) => {
    cache.current.set(path, { loaded, atHead: headRef.current })
    tick((n) => n + 1)
  }, [])

  const advance = useCallback(
    (path: string, loaded: Loaded<unknown>, commitSha: string | null) => {
      if (commitSha) headRef.current = commitSha
      const head = headRef.current
      for (const [p, entry] of cache.current) {
        if (p !== path) cache.current.set(p, { loaded: entry.loaded, atHead: head })
      }
      cache.current.set(path, { loaded, atHead: head })
      if (commitSha) setHeadState((prev) => (prev === commitSha ? prev : commitSha))
      tick((n) => n + 1)
    },
    [],
  )

  return (
    <RepoDataContext.Provider value={{ headSha, setHead, peek, store, advance }}>
      {children}
    </RepoDataContext.Provider>
  )
}

export function useRepoData(): RepoDataValue {
  const ctx = useContext(RepoDataContext)
  if (!ctx) throw new Error('useRepoData must be used within a RepoDataProvider')
  return ctx
}
