import type { GitHubClient } from './client'
import { getFile, putFile } from './contents'
import type { ContentFile, GitHubError } from './types'

/** One JSON file per collection. Shardable later if volume ever demands it. */
export const DATA_PATHS = {
  ingredients: 'data/ingredients.json',
  recipes: 'data/recipes.json',
  templates: 'data/templates.json',
  lists: 'data/lists.json',
} as const

export type DataPath = (typeof DATA_PATHS)[keyof typeof DATA_PATHS]

/** Read a JSON array from the repo. A missing file reads as an empty collection. */
export async function readJson<T>(client: GitHubClient, path: string): Promise<T[]> {
  try {
    const file = await getFile(client, path)
    const parsed = JSON.parse(file.text) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch (e) {
    if ((e as GitHubError).status === 404) return []
    throw e
  }
}

/**
 * Write a JSON array back to the repo as a single commit. The current blob SHA is
 * fetched immediately before the write so concurrent edits don't need manual tracking.
 * Requires a write token.
 */
export async function writeJson<T>(
  client: GitHubClient,
  path: string,
  items: T[],
  message: string,
): Promise<void> {
  const sha = await currentSha(client, path)
  const text = JSON.stringify(items, null, 2) + '\n'
  await putFile(client, path, text, sha, message)
}

async function currentSha(client: GitHubClient, path: string): Promise<string | null> {
  try {
    const file = await client.request<ContentFile>(`/contents/${path}`)
    return file.sha
  } catch (e) {
    if ((e as GitHubError).status === 404) return null
    throw e
  }
}
