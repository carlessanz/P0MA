// Rutas comunes: raíz por rol, guarda de acceso y pantalla de cortesía.

import { Navigate, Outlet } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { useAppContext } from '../hooks/useAppContext'
import { rutaArrel, type Rol } from '../lib/rols'
import { Button } from '@/components/ui/button'

function Carregant() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <p className="text-sm text-muted-foreground">…</p>
    </div>
  )
}

/** `/` manda a cada cual a su panel. */
export function ArrelPerRol() {
  const { carregant, rolActiu } = useAppContext()
  if (carregant) return <Carregant />
  return <Navigate to={rutaArrel(rolActiu)} replace />
}

/**
 * Guarda por rama del árbol de rutas (no por página): es donde de verdad vive la
 * decisión. Si la cuenta no tiene ese panel, se la manda al suyo en vez de dejarla
 * mirando un error.
 */
export function RoleGuard({ rol }: { rol: Rol }) {
  const { ctx, carregant, rolActiu, setRolActiu } = useAppContext()
  if (carregant) return <Carregant />
  if (!ctx) return <Navigate to="/sense-acces" replace />
  if (!ctx.rols.includes(rol)) return <Navigate to={rutaArrel(rolActiu)} replace />
  // Entrar por enlace directo a un panel también cambia el panel activo.
  if (rolActiu !== rol) setRolActiu(rol)
  return <Outlet />
}

/** Cuenta sin rol ni membresía: existe, pero todavía no tiene panel. */
export function SenseAcces() {
  const { t } = useT()
  const { ctx } = useAppContext()
  return (
    <div className="grid min-h-dvh place-items-center bg-primary px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto size-8 text-accent" />
        <h1 className="mt-3 text-lg font-semibold">{t('noacc.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('noacc.desc')}</p>
        {ctx?.email && <p className="mt-3 text-xs text-muted-foreground">{ctx.email}</p>}
        <Button className="mt-5 w-full" variant="outline" onClick={() => void supabase.auth.signOut()}>
          {t('nav.logout')}
        </Button>
      </div>
    </div>
  )
}
