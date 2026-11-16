import { STORAGE_KEY } from '../config'

/**
 * Working state that must survive a page refresh but is NOT a commit: the list being
 * assembled, and in-progress shopping ticks. Namespaced per repo, like the PAT.
 */
const PREFIX = STORAGE_KEY.replace(/:pat$/, '')

function key(k: string): string {
  return `${PREFIX}:${k}`
}

export function getDraft<T>(k: string): T | null {
  const raw = localStorage.getItem(key(k))
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setDraft<T>(k: string, value: T): void {
  localStorage.setItem(key(k), JSON.stringify(value))
}

export function clearDraft(k: string): void {
  localStorage.removeItem(key(k))
}

export const DRAFT_NEW_LIST = 'draft:list:new'
export const draftShopKey = (listId: string) => `draft:shop:${listId}`
