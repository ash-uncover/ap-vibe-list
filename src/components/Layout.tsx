import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { getHeadSha } from '../github/repo'
import { useRepoData } from '../github/RepoData'
import { BottomNav } from './BottomNav'

export function Layout() {
  const { client, logout } = useAuth()
  const { setHead } = useRepoData()
  const { pathname } = useLocation()

  // On every navigation, cheaply check the repo's head commit. When it moved, cached
  // collections become stale and useCollection refetches them; an unchanged head means the
  // cache is served without a network round-trip.
  useEffect(() => {
    if (!client) return
    let cancelled = false
    getHeadSha(client).then((sha) => {
      if (!cancelled && sha) setHead(sha)
    })
    return () => {
      cancelled = true
    }
  }, [client, pathname, setHead])

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-header__brand">
            <span className="app-header__mark" aria-hidden>
              🛒
            </span>
            <span className="app-header__name">Shopping</span>
          </Link>

          <div className="app-header__right">
            <button className="btn btn--default btn--sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <BottomNav />
    </>
  )
}
