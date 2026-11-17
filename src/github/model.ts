/**
 * Domain model for ap-vibe-list. All of these are persisted as JSON arrays in the
 * repository (see data.ts). Ingredient references are always by `id` — never a raw name.
 */

/** Allowed units. Stored as stable codes; UNITS maps them to display labels. */
export type Unit = 'piece' | 'pack' | 'g' | 'kg'

export const UNITS: { code: Unit; label: string; short: string }[] = [
  { code: 'piece', label: 'Pièce', short: 'pce' },
  { code: 'pack', label: 'Paquet', short: 'paq' },
  { code: 'g', label: 'Poids (g)', short: 'g' },
  { code: 'kg', label: 'Poids (kg)', short: 'kg' },
]

export const DEFAULT_UNIT: Unit = 'piece'

export function unitLabel(u: Unit): string {
  return UNITS.find((x) => x.code === u)?.label ?? u
}

export function unitShort(u: Unit): string {
  return UNITS.find((x) => x.code === u)?.short ?? u
}

export function formatAmount(quantity: number, unit: Unit): string {
  return `${quantity} ${unitShort(unit)}`
}

function isUnit(u: unknown): u is Unit {
  return UNITS.some((x) => x.code === u)
}

/** Coerce an unknown unit value to a valid Unit, falling back to `fallback`. */
export function normalizeUnit(u: unknown, fallback: Unit = DEFAULT_UNIT): Unit {
  return isUnit(u) ? u : fallback
}

export interface Ingredient {
  id: string
  name: string
  labels: string[]
  defaultUnit: Unit
}

export type BundleKind = 'template' | 'recipe'

/** A structured amount: how many of `unit` of the referenced ingredient. */
export interface Item {
  ingredientId: string
  quantity: number
  unit: Unit
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

/** Shape of a possibly-legacy stored item (old data used a free-text `amount`). */
interface RawItem {
  ingredientId: string
  quantity?: number
  unit?: unknown
  amount?: string
}

/**
 * Migrate a stored item to the current shape. Older data used a free-text `amount`
 * and ingredients had no default unit; we parse a leading number out of `amount`
 * and fall back to the ingredient's default unit (passed in).
 */
export function normalizeItem(raw: RawItem, fallbackUnit: Unit): Item {
  let quantity = 1
  if (typeof raw.quantity === 'number' && Number.isFinite(raw.quantity)) {
    quantity = raw.quantity
  } else if (typeof raw.amount === 'string') {
    const parsed = parseFloat(raw.amount)
    if (Number.isFinite(parsed)) quantity = parsed
  }
  return { ingredientId: raw.ingredientId, quantity, unit: normalizeUnit(raw.unit, fallbackUnit) }
}

/** Create a fresh id. randomUUID is available in secure contexts and on localhost. */
export function newId(): string {
  return crypto.randomUUID()
}
