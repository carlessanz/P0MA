// Mapa de rutas. Prefijo por rol (`/equip`, `/productor`, `/receptor`) porque una
// misma cuenta puede tener varios paneles (doble rol productor+entidad, §12.16) y así
// la guarda es inequívoca y el enlace, compartible.
//
// Cada ruta declara en `handle` su título y cómo quiere el contenedor:
//   · fullBleed → gestiona su propio alto (Mensajería)
//   · ample     → listado ancho, como el 90% del layout anterior

import { createBrowserRouter, Navigate } from 'react-router'
import AppShell from '../layout/AppShell'
import { ArrelPerRol, RoleGuard, SenseAcces } from '../routes/Comuns'
import Dashboard from '../components/Dashboard'
import Settings from '../components/Settings'
import { Entitats, Ofertes, Productors } from '../routes/equip/Llistats'
import OfertaDetall from '../routes/equip/OfertaDetall'
import FitxaRegistre from '../routes/equip/FitxaRegistre'
import Missatgeria from '../routes/equip/Missatgeria'
import Aprovacions from '../routes/equip/Aprovacions'
import { ProductorInici, ProductorOfertes } from '../routes/productor/Ofertes'
import NovaOferta from '../routes/productor/NovaOferta'
import ProductorOfertaDetall from '../routes/productor/OfertaDetall'
import PerfilOrganitzacio from '../routes/PerfilOrganitzacio'
import Mercat from '../routes/receptor/Mercat'
import { Historic, Interessos } from '../routes/receptor/Interessos'

export const router = createBrowserRouter([
  { path: '/', element: <ArrelPerRol /> },
  { path: '/sense-acces', element: <SenseAcces /> },
  {
    element: <AppShell />,
    children: [
      {
        path: '/equip',
        element: <RoleGuard rol="intern" />,
        children: [
          { index: true, element: <Navigate to="/equip/tauler" replace /> },
          { path: 'tauler', element: <Dashboard />, handle: { titleKey: 'nav.dashboard' } },
          { path: 'ofertes', element: <Ofertes />, handle: { titleKey: 'nav.offers', ample: true } },
          { path: 'ofertes/:id', element: <OfertaDetall />, handle: { titleKey: 'nav.offers' } },
          { path: 'aprovacions', element: <Aprovacions />, handle: { titleKey: 'nav.approvals' } },
          { path: 'productors', element: <Productors />, handle: { titleKey: 'nav.producers', ample: true } },
          { path: 'productors/nou', element: <FitxaRegistre tabla="productores" />, handle: { titleKey: 'nav.producers' } },
          { path: 'productors/:id', element: <FitxaRegistre tabla="productores" />, handle: { titleKey: 'nav.producers' } },
          { path: 'entitats', element: <Entitats />, handle: { titleKey: 'nav.entities', ample: true } },
          { path: 'entitats/nova', element: <FitxaRegistre tabla="entidades" />, handle: { titleKey: 'nav.entities' } },
          { path: 'entitats/:id', element: <FitxaRegistre tabla="entidades" />, handle: { titleKey: 'nav.entities' } },
          { path: 'missatgeria', element: <Missatgeria />, handle: { titleKey: 'nav.messaging', fullBleed: true } },
          { path: 'missatgeria/:phone', element: <Missatgeria />, handle: { titleKey: 'nav.messaging', fullBleed: true } },
          { path: 'configuracio', element: <Settings />, handle: { titleKey: 'nav.settings' } },
        ],
      },
      {
        path: '/productor',
        element: <RoleGuard rol="productor" />,
        children: [
          { index: true, element: <Navigate to="/productor/inici" replace /> },
          { path: 'inici', element: <ProductorInici />, handle: { titleKey: 'nav.home' } },
          { path: 'ofertes', element: <ProductorOfertes />, handle: { titleKey: 'nav.my_offers' } },
          { path: 'ofertes/nova', element: <NovaOferta />, handle: { titleKey: 'nav.new_offer' } },
          { path: 'ofertes/:id', element: <ProductorOfertaDetall />, handle: { titleKey: 'nav.my_offers' } },
          { path: 'perfil', element: <PerfilOrganitzacio />, handle: { titleKey: 'nav.my_org' } },
        ],
      },
      {
        path: '/receptor',
        element: <RoleGuard rol="receptor" />,
        children: [
          { index: true, element: <Navigate to="/receptor/mercat" replace /> },
          { path: 'mercat', element: <Mercat />, handle: { titleKey: 'nav.market' } },
          { path: 'interessos', element: <Interessos />, handle: { titleKey: 'nav.my_interests' } },
          { path: 'historic', element: <Historic />, handle: { titleKey: 'nav.history' } },
          { path: 'perfil', element: <PerfilOrganitzacio />, handle: { titleKey: 'nav.my_org' } },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
