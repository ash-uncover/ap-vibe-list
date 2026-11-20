import type { GitHubClient } from './client'

/**
 * Latest commit sha on the repo's default branch — a cheap "repo version" token used to
 * decide whether cached collections are still current. Best-effort: any failure (including
 * the demo mock, which doesn't implement this endpoint) resolves to null, meaning
 * "freshness unknown — don't invalidate".
 */
export async function getHeadSha(client: GitHubClient): Promise<string | null> {
  try {
    const commits = await client.request<{ sha: string }[]>('/commits?per_page=1')
    return commits[0]?.sha ?? null
  } catch {
    return null
  }
}
