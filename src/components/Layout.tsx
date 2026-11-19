import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { BottomNav } from './BottomNav'

export function Layout() {
  const { logout } = useAuth()

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
