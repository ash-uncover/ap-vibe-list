# ap-vibe-list

A client-side **React** app that lives on GitHub and operates on **this repository**
through the GitHub API on the user's behalf.

Built on the [`ap-vibe-template`](https://github.com/ash-uncover/ap-vibe-template)
scaffolding: **React + React Router**, **Vite**, **TypeScript (strict)**, GitHub **PAT**
authentication, and **GitHub Pages** deployment — with the target repository resolved
automatically so there is nothing to hand-edit.

## What it does

> _TODO: describe the list feature once it's built._

The template ships with a working read + write demo — an in-repo file editor that reads
`data/notes.md` through the GitHub Contents API and commits changes back, exercising the
full round-trip.

## Stack

| Concern    | Choice                                   |
|------------|------------------------------------------|
| Framework  | React 19                                 |
| Routing    | React Router                             |
| Build tool | Vite                                     |
| Language   | TypeScript (strict)                      |
| API access | Native `fetch` (no Octokit) + GitHub PAT |
| Hosting    | GitHub Pages via GitHub Actions          |

Dependencies are kept deliberately small. Reach for a library only when it is clearly the
right tool.

## Local development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build into dist/
npm run preview    # preview the production build locally
```

## Authentication

The app authenticates with a **GitHub Personal Access Token** that the user pastes into the
login screen. The token is stored in `localStorage`.

- On login the app calls the GitHub API to determine whether the token grants **write**
  (`permissions.push`) or only **read** access, and reflects that in the UI.
- Read features work with a read-only token; write features (committing changes) require a
  token with write access and are disabled otherwise.
- The required scopes are resolved in one place — `TOKEN_SCOPES` in `src/config.ts` — and
  auto-select by repository visibility: `public_repo` for a public repo, `repo` for a
  private one. The login screen's "Create a token" link preselects them.

> **Security note:** storing a PAT in `localStorage` is standard for a personal, client-side
> GitHub tool, but the token is readable by any script running on the page. Use a
> fine-grained token scoped to this single repository.

## How deployment works

- `.github/workflows/deploy.yml` builds the app and deploys it with the official Pages
  actions on push to `main`. Set Pages **Source** to **GitHub Actions** (one-time).
- Because the app is served from a project subpath (`/<repo>/`), Vite's `base` and the
  React Router `basename` are both derived from the auto-resolved repo name.
- A `404.html` fallback is emitted at build time so deep links resolve correctly on Pages.
- `dist/` is never committed — the workflow produces it.

## Project structure

```
src/
  config.ts          Repo reference — auto-resolved; derives API, base, scopes, URLs
  main.tsx           App entry, Router with basename
  App.tsx            Routes
  auth/              PAT login, token storage, read/write detection
  github/            fetch client + Contents API helpers (read/write a file)
  routes/            Home + the file-editor demo
```

See `CLAUDE.md` for the conventions to follow when building on this codebase.
