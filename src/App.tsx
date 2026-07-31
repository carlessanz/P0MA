// Raíz de la aplicación.
//
// Antes vivía aquí todo el estado de navegación (la vista activa, la oferta abierta,
// los contactos…). Ahora eso es la URL: el router lo resuelve y cada pantalla carga lo
// suyo.
//
// Y antes envolvía todo un AuthGate: sin sesión no existía ni el router. Desde que hay
// parte pública, el orden se invierte. Lo único global es la sesión cruda —¿hay token?—,
// porque la necesitan tanto la landing como las guardas; el contexto de rol se monta más
// abajo, ya dentro de RequireSessio, y solo con sesión confirmada.

import { RouterProvider } from 'react-router'
import { SessioProvider } from './hooks/useSessio'
import { router } from './router'

export default function App() {
  return (
    <SessioProvider>
      <RouterProvider router={router} />
    </SessioProvider>
  )
}
