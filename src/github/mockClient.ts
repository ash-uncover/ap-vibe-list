import { REPO } from '../config'
import { STORAGE_KEY } from '../config'
import { GitHubClient } from './client'
import type { ContentFile, GitHubError, Repo } from './types'

/**
 * DEV-only stand-in for GitHubClient. It implements the same `request` surface the
 * data layer depends on (GET/PUT /contents/<path> and the repo probe), backed by
 * localStorage instead of the GitHub API. This lets the whole app be exercised with
 * no PAT and no commits to the real repository. Never used in production.
 */
const PREFIX = STORAGE_KEY.replace(/:pat$/, '')
const fileKey = (path: string) => `${PREFIX}:mock:${path}`

interface StoredFile {
  sha: string
  content: string // base64, as GitHub returns it
}

export const DEMO_REPO: Repo = {
  full_name: `${REPO.owner}/${REPO.repo} · demo`,
  description: 'Local demo mode — data lives in your browser (localStorage).',
  default_branch: 'main',
  html_url: '#',
  private: false,
  stargazers_count: 0,
  permissions: { admin: true, push: true, pull: true },
}

function b64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

export class MockGitHubClient extends GitHubClient {
  constructor() {
    super('demo')
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (path === '') return DEMO_REPO as T

    const m = path.match(/^\/contents\/([^?]+)/)
    if (m) {
      const filePath = decodeURIComponent(m[1])
      const method = init.method ?? 'GET'

      if (method === 'GET') {
        const raw = localStorage.getItem(fileKey(filePath))
        if (!raw) throw notFound()
        const stored = JSON.parse(raw) as StoredFile
        const file: ContentFile = {
          type: 'file',
          name: filePath.split('/').pop() ?? filePath,
          path: filePath,
          sha: stored.sha,
          size: 0,
          content: stored.content,
          encoding: 'base64',
          html_url: '#',
        }
        return file as T
      }

      if (method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { content: string }
        const sha = crypto.randomUUID().replace(/-/g, '')
        localStorage.setItem(fileKey(filePath), JSON.stringify({ sha, content: body.content }))
        return { content: { sha } } as T
      }
    }

    const err: GitHubError = { status: 501, message: `demo mock: unhandled ${init.method ?? 'GET'} ${path}` }
    throw err
  }
}

function notFound(): GitHubError {
  return { status: 404, message: 'Not Found (demo)' }
}

// Re-exported so AuthContext can seed an empty file if ever needed.
export const seedDemoFile = (path: string, text: string) =>
  localStorage.setItem(fileKey(path), JSON.stringify({ sha: 'seed', content: b64(text) }))
