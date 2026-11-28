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
  labelIds: string[]
  defaultUnit: Unit
}

/** A reusable, named label. Ingredients reference labels by `id`, so renaming a label
 *  here is reflected everywhere it is used without touching any ingredient. */
export interface Label {
  id: string
  name: string
}

/** Resolve label ids to their names via a catalog, dropping unknown ids, sorted for display. */
export function labelNames(ids: string[], byId: Map<string, Label>): string[] {
  return ids
    .map((id) => byId.get(id)?.name)
    .filter((n): n is string => n !== undefined)
    .sort((a, b) => a.localeCompare(b))
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

export interface AttachedRecipe {
  recipeId: string
  name: string // snapshot of the recipe name for display
  items: Item[] // snapshot of the recipe's items at attach time
}

export interface ShoppingList {
  id: string
  name: string
  status: ListStatus
  createdAt: string
  completedAt?: string
  items: Item[] // user items (template-seeded + manually added), editable
  recipes: AttachedRecipe[] // attached recipe groups, read-only snapshots
  bought: string[] // effective lines ticked, keyed `${ingredientId}|${unit}`
}

export function boughtKey(ingredientId: string, unit: Unit): string {
  return `${ingredientId}|${unit}`
}

/**
 * The actual shopping list, computed from user items + attached recipes.
 * Per (ingredient, unit): recipes sum among themselves, and user-added items cover
 * them — effective quantity = max(user, Σ recipes). Different units never combine.
 */
export function effectiveItems(items: Item[], recipes: AttachedRecipe[]): Item[] {
  const user = new Map<string, number>()
  for (const it of items) {
    const k = boughtKey(it.ingredientId, it.unit)
    user.set(k, (user.get(k) ?? 0) + it.quantity)
  }
  const rec = new Map<string, number>()
  for (const g of recipes) {
    for (const it of g.items) {
      const k = boughtKey(it.ingredientId, it.unit)
      rec.set(k, (rec.get(k) ?? 0) + it.quantity)
    }
  }
  const out: Item[] = []
  for (const k of new Set([...user.keys(), ...rec.keys()])) {
    const sep = k.indexOf('|')
    out.push({
      ingredientId: k.slice(0, sep),
      unit: k.slice(sep + 1) as Unit,
      quantity: Math.max(user.get(k) ?? 0, rec.get(k) ?? 0),
    })
  }
  return out
}

export function listProgress(list: ShoppingList): { done: number; total: number } {
  const eff = effectiveItems(list.items, list.recipes)
  const bought = new Set(list.bought)
  return {
    done: eff.filter((e) => bought.has(boughtKey(e.ingredientId, e.unit))).length,
    total: eff.length,
  }
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

interface RawListItem {
  ingredientId: string
  quantity?: number
  unit?: unknown
  amount?: string
  bought?: boolean
}

interface RawList {
  id: string
  name: string
  status: ListStatus
  createdAt: string
  completedAt?: string
  items?: RawListItem[]
  recipes?: { recipeId?: string; name?: string; items?: RawItem[] }[]
  bought?: string[]
}

/** Migrate a stored list (possibly the old flat/bought shape) to the current model. */
export function migrateList(
  raw: RawList,
  fallbackUnit: (ingredientId: string) => Unit,
): ShoppingList {
  const items = (raw.items ?? []).map((r) => normalizeItem(r, fallbackUnit(r.ingredientId)))
  const recipes: AttachedRecipe[] = (raw.recipes ?? []).map((g) => ({
    recipeId: g.recipeId ?? '',
    name: g.name ?? 'Recipe',
    items: (g.items ?? []).map((r) => normalizeItem(r, fallbackUnit(r.ingredientId))),
  }))
  const bought = Array.isArray(raw.bought)
    ? raw.bought
    : (raw.items ?? [])
        .filter((r) => r.bought)
        .map((r) => boughtKey(r.ingredientId, normalizeItem(r, fallbackUnit(r.ingredientId)).unit))
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    createdAt: raw.createdAt,
    completedAt: raw.completedAt,
    items,
    recipes,
    bought,
  }
}
