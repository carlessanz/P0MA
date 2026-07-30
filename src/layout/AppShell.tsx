// Shell de la aplicación: menú lateral + barra superior + contenido + barra inferior.
//
// CONTRATO DE ALTURAS (es lo que mantiene viva la Mensajería):
//   · el shell es una columna flex de `h-dvh` con `overflow-hidden`; nadie más vuelve
//     a escribir `h-dvh` en ninguna pantalla
//   · `main` es `min-h-0 flex-1`; scrollea él, salvo en las rutas `fullBleed`
//     (Mensajería), donde no scrollea y el hijo se reparte el alto
//   · la barra inferior es hermana flex `shrink-0`, no `fixed`: así ninguna pantalla
//     necesita padding inferior y el composer del chat nunca queda debajo

import { useEffect, useState } from 'react'
import { Outlet, useMatches } from 'react-router'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'
import { useT } from '../lib/i18n'
import { useAppContext } from '../hooks/useAppContext'
import { itemsPlans, navPerRol } from '../lib/nav'
import { countUnanswered } from '../lib/mensajes'
import type { MessageRow } from '../lib/mensajes'
import AppSidebar from './AppSidebar'
import BottomNav from './BottomNav'
import UserMenu from './UserMenu'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

/** Metadatos que cada ruta puede declarar en su `handle`. */
export interface RouteHandle {
  titleKey?: string
  /** La pantalla gestiona su propio alto y scroll (Mensajería). */
  fullBleed?: boolean
  /** Listados anchos, como el 90% que usaba el layout anterior. */
  ample?: boolean
}

export default function AppShell() {
  const { t } = useT()
  const { ctx, rolActiu } = useAppContext()
  const matches = useMatches()
  const [comptadors, setComptadors] = useState<{ aprovacions?: number; missatges?: number }>({})

  const handle = (matches[matches.length - 1]?.handle ?? {}) as RouteHandle
  const grups = navPerRol(rolActiu)
  const items = itemsPlans(grups)
  const ambBarraInferior = rolActiu !== 'intern' && items.length > 0 && items.length <= 5

  // Contadores del menú del equipo. Se calculan una vez aquí y se reparten, para no
  // repetir la consulta en cada sección.
  useEffect(() => {
    if (rolActiu !== 'intern') { setComptadors({}); return }
    let viu = true
    void (async () => {
      const [respostes, missatges] = await Promise.all([
        supabase.from('oferta_respuestas')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'acceptada').eq('aprovacio', 'pendent'),
        supabase.from('wa_messages').select('contact_phone, direction, created_at'),
      ])
      if (!viu) return
      const pendents = countUnanswered((missatges.data as MessageRow[]) ?? [])
      setComptadors({
        aprovacions: respostes.count ?? 0,
        missatges: Object.values(pendents).reduce((s, n) => s + n, 0),
      })
    })()
    return () => { viu = false }
  }, [rolActiu])

  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
      <AppSidebar comptadors={comptadors} />
      <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:px-4">
          <SidebarTrigger className="-ml-1" />
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base">
            {handle.titleKey ? t(handle.titleKey) : ''}
          </h1>
          {ctx?.degradat && (
            <span
              className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline"
              title={t('app.degraded_hint')}
            >
              {t('app.degraded')}
            </span>
          )}
          <UserMenu />
        </header>

        <main className={cn('min-h-0 flex-1', handle.fullBleed ? 'overflow-hidden' : 'overflow-y-auto')}>
          {handle.fullBleed
            ? <Outlet />
            : (
              <div className={cn('mx-auto w-full py-6', handle.ample ? 'w-[96%] px-2' : 'max-w-6xl px-4')}>
                <Outlet />
              </div>
            )}
        </main>

        {ambBarraInferior && <BottomNav items={items} />}
      </SidebarInset>
    </SidebarProvider>
  )
}
