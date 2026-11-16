import { NavLink } from 'react-router'

interface Tab {
  to: string
  label: string
  glyph: string
  end?: boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', glyph: '⌂', end: true },
  { to: '/lists', label: 'Lists', glyph: '☰' },
  { to: '/recipes', label: 'Recipes', glyph: '❖' },
  { to: '/templates', label: 'Templates', glyph: '★' },
  { to: '/ingredients', label: 'Items', glyph: '◉' },
]

export function BottomNav() {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `tabbar__tab${isActive ? ' is-active' : ''}`}
        >
          <span className="tabbar__glyph" aria-hidden>
            {t.glyph}
          </span>
          <span className="tabbar__label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
