/**
 * Domain model for ap-vibe-list. All of these are persisted as JSON arrays in the
 * repository (see data.ts). Ingredient references are always by `id` — never a raw name.
 */

export interface Ingredient {
  id: string
  name: string
  labels: string[]
}

export type BundleKind = 'template' | 'recipe'

/** An ingredient reference plus an optional free-text amount ("500g", "2", "2 bottles"). */
export interface Item {
  ingredientId: string
  amount?: string
}

/** A reusable, named set of items. `kind` only changes how it feeds list assembly. */
export interface Bundle {
  id: string
  name: string
  kind: BundleKind
  items: Item[]
}

export type ListStatus = 'active' | 'completed'

export interface ListItem extends Item {
  bought: boolean
}

export interface ShoppingList {
  id: string
  name: string
  status: ListStatus
  createdAt: string
  completedAt?: string
  items: ListItem[]
}

/** Create a fresh id. randomUUID is available in secure contexts and on localhost. */
export function newId(): string {
  return crypto.randomUUID()
}
