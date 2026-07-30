// Raíz de la aplicación.
//
// Antes vivía aquí todo el estado de navegación (la vista activa, la oferta abierta,
// los contactos…). Ahora eso es la URL: el router lo resuelve y cada pantalla carga lo
// suyo. Lo que queda es el orden de las tres capas: sesión → contexto de rol → rutas.

import { RouterProvider } from 'react-router'
import AuthGate from './components/AuthGate'
import { AppContextProvider } from './hooks/useAppContext'
import { router } from './router'

export default function App() {
  return (
    <AuthGate>
      <AppContextProvider>
        <RouterProvider router={router} />
      </AppContextProvider>
    </AuthGate>
  )
}
