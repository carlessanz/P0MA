// Tipos y reglas del contexto de sesión: qué panel ve cada persona.
//
// El rol NO viaja en el JWT a propósito (AGENTS.md §4bis): se resuelve con una
// llamada a get_my_session_context() al entrar. Así, desactivar una cuenta o
// cambiarle el rol tiene efecto inmediato, sin esperar a que caduque el token.

/** Panel: el equipo interno, un productor o una entidad receptora. */
export type Rol = 'intern' | 'productor' | 'receptor'

export type RolPlataforma = 'super_admin' | 'admin' | 'tecnic'
export type TipusReceptor = 'social' | 'animal' | 'transformador' | 'comercial'

export interface Organitzacio {
  tipo: 'productor' | 'entidad'
  id: string
  nombre: string | null
  rol_org: 'titular' | 'operador'
  tipo_receptor: TipusReceptor | null
  modalitat: string | null
  poblacion: string | null
}

export interface ContextSessio {
  userId: string
  email: string | null
  nombre: string | null
  idioma: 'ca' | 'es'
  /** Rol de plataforma; null si es un usuario externo. */
  rol: RolPlataforma | null
  esIntern: boolean
  potAprovar: boolean
  esSuperAdmin: boolean
  /** ¿Está encendido el modelo de roles en la base? (§4bis) */
  rolesActivos: boolean
  organitzacions: Organitzacio[]
  /** Paneles a los que esta cuenta tiene acceso; puede ser más de uno (doble rol). */
  rols: Rol[]
  /**
   * true cuando no se ha podido leer el contexto (la migración de roles aún no está
   * desplegada, o la RPC falla). Se trata como equipo interno: es el comportamiento
   * que la app ha tenido siempre, y con `roles_activos` apagado es además el correcto.
   */
  degradat: boolean
}

/** Forma cruda que devuelve la RPC (snake_case, como en la base). */
export interface ContextCru {
  user_id: string
  email: string | null
  nombre: string | null
  idioma: 'ca' | 'es' | null
  activo: boolean
  rol: RolPlataforma | null
  roles_activos: boolean
  es_intern: boolean
  pot_aprovar: boolean
  es_super_admin: boolean
  vista_defecto: Rol | null
  organizaciones: Organitzacio[]
}

export function mapejaContext(cru: ContextCru): ContextSessio {
  const organitzacions = cru.organizaciones ?? []
  const rols: Rol[] = []
  if (cru.es_intern) rols.push('intern')
  if (organitzacions.some((o) => o.tipo === 'productor')) rols.push('productor')
  if (organitzacions.some((o) => o.tipo === 'entidad')) rols.push('receptor')

  return {
    userId: cru.user_id,
    email: cru.email,
    nombre: cru.nombre,
    idioma: cru.idioma ?? 'ca',
    rol: cru.rol,
    esIntern: cru.es_intern,
    potAprovar: cru.pot_aprovar,
    esSuperAdmin: cru.es_super_admin,
    rolesActivos: cru.roles_activos,
    organitzacions,
    rols,
    degradat: false,
  }
}

/** Contexto de emergencia: la app se comporta como siempre (equipo interno). */
export function contextDegradat(userId: string, email: string | null): ContextSessio {
  return {
    userId,
    email,
    nombre: null,
    idioma: 'ca',
    rol: 'admin',
    esIntern: true,
    potAprovar: true,
    esSuperAdmin: true,
    rolesActivos: false,
    organitzacions: [],
    rols: ['intern'],
    degradat: true,
  }
}

/** Panel que se abre al entrar. `vista_defecto` manda si el usuario la ha elegido. */
export function rolInicial(ctx: ContextSessio, preferit: Rol | null): Rol | null {
  if (preferit && ctx.rols.includes(preferit)) return preferit
  return ctx.rols[0] ?? null
}

export function rutaArrel(rol: Rol | null): string {
  switch (rol) {
    case 'intern': return '/equip/tauler'
    case 'productor': return '/productor/inici'
    case 'receptor': return '/receptor/mercat'
    default: return '/sense-acces'
  }
}

/** La organización sobre la que trabaja el panel activo (la primera de su tipo). */
export function organitzacioActiva(ctx: ContextSessio, rol: Rol | null): Organitzacio | null {
  if (rol === 'productor') return ctx.organitzacions.find((o) => o.tipo === 'productor') ?? null
  if (rol === 'receptor') return ctx.organitzacions.find((o) => o.tipo === 'entidad') ?? null
  return null
}
