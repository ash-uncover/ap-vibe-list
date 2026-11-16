import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthContext'
import { LoginScreen } from './auth/LoginScreen'
import { Layout } from './components/Layout'
import { Home } from './routes/Home'
import { IngredientsList } from './routes/IngredientsList'
import { IngredientEdit } from './routes/IngredientEdit'
import { BundlesList } from './routes/BundlesList'
import { BundleEdit } from './routes/BundleEdit'
import { ListsList } from './routes/ListsList'
import { ListAssemble } from './routes/ListAssemble'
import { ListShop } from './routes/ListShop'

export function App() {
  const { token, initializing } = useAuth()

  if (initializing) {
    return <div className="splash">Authenticating…</div>
  }

  if (!token) {
    return <LoginScreen />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />

        <Route path="ingredients" element={<IngredientsList />} />
        <Route path="ingredients/new" element={<IngredientEdit />} />
        <Route path="ingredients/:id" element={<IngredientEdit />} />

        <Route path="recipes" element={<BundlesList kind="recipe" />} />
        <Route path="recipes/new" element={<BundleEdit kind="recipe" />} />
        <Route path="recipes/:id" element={<BundleEdit kind="recipe" />} />

        <Route path="templates" element={<BundlesList kind="template" />} />
        <Route path="templates/new" element={<BundleEdit kind="template" />} />
        <Route path="templates/:id" element={<BundleEdit kind="template" />} />

        <Route path="lists" element={<ListsList />} />
        <Route path="lists/new" element={<ListAssemble />} />
        <Route path="lists/:id" element={<ListShop />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
