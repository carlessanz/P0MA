// Contexto de sesión de la app: quién eres, qué paneles tienes y cuál estás mirando.
//
// Una sola llamada a get_my_session_context() (§4bis) al entrar. Si la RPC todavía no
// existe —porque la migración de roles no está desplegada— se cae a un contexto
// degradado de equipo interno, que es exactamente como se ha comportado la app hasta
// ahora. Así el despliegue del frontend y el de la base son independientes.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import {
  contextDegradat, mapejaContext, rolInicial,
  type ContextCru, type ContextSessio, type Organitzacio, type Rol,
} from '../lib/rols'
import { organitzacioActiva } from '../lib/rols'

const CLAU_ROL = 'poma-rol'

interface Valor {
  ctx: ContextSessio | null
  carregant: boolean
  /** Panel abierto ahora mismo (relevante solo si la cuenta tiene más de uno). */
  rolActiu: Rol | null
  setRolActiu: (rol: Rol) => void
  organitzacio: Organitzacio | null
  recarrega: () => Promise<void>
}

const Ctx = createContext<Valor | null>(null)

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<ContextSessio | null>(null)
  const [carregant, setCarregant] = useState(true)
  const [rolActiu, setRol] = useState<Rol | null>(null)

  const carrega = useCallback(async () => {
    setCarregant(true)
    const { data: sessio } = await supabase.auth.getSession()
    const usuari = sessio.session?.user
    if (!usuari) {
      setCtx(null)
      setCarregant(false)
      return
    }

    const { data, error } = await supabase.rpc('get_my_session_context')
    let nou: ContextSessio
    if (error || !data) {
      // La RPC no está desplegada todavía (o ha fallado): se sigue como equipo.
      if (error) console.warn('get_my_session_context:', error.message)
      nou = contextDegradat(usuari.id, usuari.email ?? null)
    } else {
      nou = mapejaContext(data as ContextCru)
    }

    setCtx(nou)
    const preferit = localStorage.getItem(CLAU_ROL) as Rol | null
    setRol(rolInicial(nou, preferit))
    setCarregant(false)
  }, [])

  useEffect(() => {
    void carrega()
    // Al cambiar de cuenta hay que recargar el contexto entero, no solo la sesión.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') void carrega()
    })
    return () => sub.subscription.unsubscribe()
  }, [carrega])

  const setRolActiu = useCallback((rol: Rol) => {
    localStorage.setItem(CLAU_ROL, rol)
    setRol(rol)
  }, [])

  const valor = useMemo<Valor>(() => ({
    ctx,
    carregant,
    rolActiu,
    setRolActiu,
    organitzacio: ctx ? organitzacioActiva(ctx, rolActiu) : null,
    recarrega: carrega,
  }), [ctx, carregant, rolActiu, setRolActiu, carrega])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAppContext(): Valor {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppContext debe usarse dentro de <AppContextProvider>')
  return v
}
