import type { GitHubClient } from './client'
import { getFile, putFile } from './contents'
import type { GitHubError } from './types'

/** One JSON file per collection. Shardable later if volume ever demands it. */
export const DATA_PATHS = {
  ingredients: 'data/ingredients.json',
  recipes: 'data/recipes.json',
  templates: 'data/templates.json',
  lists: 'data/lists.json',
} as const

export type DataPath = (typeof DATA_PATHS)[keyof typeof DATA_PATHS]

/** A collection as loaded from the repo: its items plus the blob sha they were read at. */
export interface Loaded<T> {
  items: T[]
  sha: string | null
}

/**
 * Read a JSON array from the repo together with its blob sha. A missing file reads as an
 * empty collection with a null sha (so a subsequent create passes no sha).
 */
export async function loadJson<T>(client: GitHubClient, path: string): Promise<Loaded<T>> {
  try {
    const file = await getFile(client, path)
    const parsed = JSON.parse(file.text) as unknown
    return { items: Array.isArray(parsed) ? (parsed as T[]) : [], sha: file.sha }
  } catch (e) {
    if ((e as GitHubError).status === 404) return { items: [], sha: null }
    throw e
  }
}

/**
 * Thrown when a write cannot be reconciled with the repo's current state (the user's
 * change clashes with a concurrent change to the same item). Carries the freshly pulled
 * latest state so the caller can display it.
 */
export class ConflictError extends Error {
  readonly latest: Loaded<unknown>
  constructor(latest: Loaded<unknown>) {
    super('This item changed in the repository since you loaded it.')
    this.name = 'ConflictError'
    this.latest = latest
  }
}

/**
 * Optimistic read-modify-write with git-style rebase.
 *
 * `apply` transforms the current array into the one to write, or returns `null` to signal
 * a true conflict (the item it targets changed or vanished). The write carries the sha the
 * data was loaded at; if GitHub rejects it (409, someone else committed), we pull the
 * latest and re-apply — so edits to *different* items merge, while a clash on the *same*
 * item surfaces as a ConflictError carrying the latest state.
 */
export async function commitJson<T>(
  client: GitHubClient,
  path: string,
  base: Loaded<T>,
  apply: (current: T[]) => T[] | null,
  message: string,
): Promise<{ loaded: Loaded<T>; commitSha: string | null }> {
  let current = base
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = apply(current.items)
    if (next === null) throw new ConflictError(current)
    const text = JSON.stringify(next, null, 2) + '\n'
    try {
      const { contentSha, commitSha } = await putFile(client, path, text, current.sha, message)
      return { loaded: { items: next, sha: contentSha }, commitSha }
    } catch (e) {
      if ((e as GitHubError).status !== 409) throw e
      current = await loadJson<T>(client, path) // pull latest, then re-apply (rebase)
    }
  }
  throw new ConflictError(current)
}

/** Order-independent structural equality for parsed-JSON values (no external dependency). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  if (ak.length !== bk.length) return false
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
}

interface Identified {
  id: string
}

/** Append a brand-new entity. Always rebase-safe (a fresh unique id never clashes). */
export function appendOp<T>(entity: T): (current: T[]) => T[] {
  return (current) => [...current, entity]
}

/**
 * Create or update an entity by id. When `base` is given (an edit), the write conflicts if
 * the item is gone or has changed vs. the version the user edited from.
 */
export function upsertOp<T extends Identified>(
  next: T,
  base: T | null,
): (current: T[]) => T[] | null {
  return (current) => {
    if (base) {
      const now = current.find((x) => x.id === base.id)
      if (!now || !deepEqual(now, base)) return null
    }
    return [...current.filter((x) => x.id !== next.id), next]
  }
}

/**
 * Delete an entity by id. Already gone ⇒ success no-op; present but changed vs. `base`
 * ⇒ conflict (someone edited what you're deleting); otherwise remove it.
 */
export function removeOp<T extends Identified>(
  id: string,
  base: T,
): (current: T[]) => T[] | null {
  return (current) => {
    const now = current.find((x) => x.id === id)
    if (!now) return current
    if (!deepEqual(now, base)) return null
    return current.filter((x) => x.id !== id)
  }
}
