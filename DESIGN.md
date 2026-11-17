# DESIGN.md — ap-vibe-list

A mobile-first **shopping-list** app built on the `ap-vibe-template` scaffolding. It is a
client-side React app that persists all data as JSON files in **this GitHub repository**,
through the Contents API, using the user's PAT.

> This document is the agreed functional + data design. It sits on top of — and must not
> break — the four guarantees in `CLAUDE.md` (one auto-resolved repo reference, PAT
> read/write gating, minimal dependencies, Pages-safe routing).

## Use cases

1. **Build a list** — pick ingredients from the catalog; start from a **template**; pour in
   one or more **recipes**; or **clone a past list** (all items, or only the un-bought
   ones). Add a missing ingredient to the catalog on the fly.
2. **Shop a list** — a todo view: tick items as *bought*. Progress is local until saved.
3. **Recipes & templates** — reusable, named bundles of ingredients.

## Data model

```ts
interface Ingredient {
  id: string
  name: string
  labels: string[]            // many-to-many; known labels = union of those in use
  defaultUnit: Unit           // pre-fills the unit when added to a bundle/list
}

type Unit = 'piece' | 'pack' | 'g' | 'kg'   // display: Pièce · Paquet · Poids (g) · Poids (kg)

type BundleKind = 'template' | 'recipe'

interface Bundle {
  id: string
  name: string
  kind: BundleKind            // one structure, two intents
  items: Item[]
}

interface List {
  id: string
  name: string
  status: 'active' | 'completed'
  createdAt: string           // ISO
  completedAt?: string        // ISO
  items: Item[]               // user items (template-seeded + manually added), editable
  recipes: AttachedRecipe[]   // attached recipe snapshots (read-only groups)
  bought: string[]            // effective lines ticked, keyed `${ingredientId}|${unit}`
}

interface Item {
  ingredientId: string        // always a reference to an Ingredient — never free text
  quantity: number            // structured so quantities aggregate
  unit: Unit                  // defaults to the ingredient's defaultUnit; editable per item
}

interface AttachedRecipe {
  recipeId: string
  name: string                // snapshot for display
  items: Item[]               // snapshot at attach time — immune to later recipe edits
}
```

- **Ingredient references, never names.** Adding a "missing" ingredient = create the
  catalog `Ingredient` first, then reference it.
- **Templates vs recipes** are the same `Bundle` structure; `kind` only differs in *when/how*
  they feed list assembly: a **template seeds** a new list; a **recipe expands** into one.
- **Provenance-aware composition.** A list keeps **user items** (template seeding folds in
  here, fully editable) separate from **attached recipes** (read-only snapshot groups). The
  actual shopping list is **computed**: per (ingredient, unit), recipes sum among themselves
  and user items cover them — `effective = max(user, Σ recipes)`; different units never
  combine. `bought` is tracked per effective line (`ingredientId|unit`). Recipe snapshots keep
  a list immune to later recipe edits; the shop view shows the flat effective list.
- Labels can group/filter the shop view; because an ingredient may carry several, grouping
  is a filter, not a strict one-aisle partition.
- **Amounts are structured** (`quantity` + `unit`) so identical ingredient+unit items sum
  when bundles/lists merge (`2 pce` + `3 pce` → `5 pce`); `defaultUnit` pre-fills new items.
  Legacy free-text `amount` and missing `defaultUnit` are migrated on read.
- IDs: `crypto.randomUUID()`.

## Storage

One JSON file per collection under `data/` (shardable to per-id files later if volume ever
demands it):

| File | Contents |
|------|----------|
| `data/ingredients.json` | `Ingredient[]` |
| `data/recipes.json`     | `Bundle[]` (kind `recipe`) |
| `data/templates.json`   | `Bundle[]` (kind `template`) |
| `data/lists.json`       | `List[]` (active + completed; persist until deleted) |

All start as `[]` seeded in the repo so first reads don't 404. The demo `data/notes.md`
and its file-editor route are removed.

## Persistence model — explicit save only

There is **no autosave**. Working state lives in `localStorage` (namespaced per repo, like
the PAT) so a refresh never loses progress; a **GitHub commit happens only on an explicit
user action**.

| Action | Commits |
|--------|---------|
| Create / edit / delete an ingredient | `ingredients.json` |
| Create / edit / delete a recipe | `recipes.json` |
| Create / edit / delete a template | `templates.json` |
| **Create** a list (after assembly) | `lists.json` |
| **Mark a list completed** | `lists.json` (bought flags + `completed`/`completedAt`) |
| Delete a list | `lists.json` |
| Assembling a list before "Create" | — localStorage draft only |
| Ticking items while shopping | — localStorage only; flushed to the commit at *completed* |

Writes go through `src/github/client.ts`; the Contents API requires each file's current
blob SHA, which the data layer tracks and refreshes on conflict.

## Read / write gating (guarantee #2)

- **Read-only token:** browse the catalog, recipes, templates, and lists; may even tick
  items locally while shopping. Every *Save / Create / Edit / Delete / Complete* above is
  disabled with a clear reason. Nothing persists.
- **Write token:** full functionality.

## Routes

```
/                  home — active lists + quick actions
/ingredients       catalog
/ingredients/new   create
/ingredients/:id   edit
/recipes           all recipes
/recipes/new       create   ┐ shared BundleEditor, kind fixed by route
/recipes/:id       edit     ┘
/templates         all templates
/templates/new     create   ┐ shared BundleEditor
/templates/:id     edit     ┘
/lists             all lists
/lists/new         assemble a list   (?from=<listId> to clone)
/lists/:id         shop + edit while active
```

"Add a missing ingredient" from inside the recipe/template/list editors routes to the
ingredient create flow and returns to the assembly in progress.

## UX constraints

- **Mobile-first.** The app is primarily used on a phone: one primary task per screen,
  large touch targets, a bottom navigation bar, full-page forms over cramped inline editing.
- Functional components + hooks only; co-located styles; TypeScript strict, no `any`.
- GitHub response shapes modeled as explicit interfaces in `src/github/`.

## Deferred / revisit

- Sharding `lists.json` to per-list files if lists ever number in the hundreds.
- Label management UI (rename/merge) — labels are free-form strings for now.
- Conflict UX beyond SHA-refresh retry (single-user assumption holds for now).
