// Menú lateral vertical y plegable (16rem ↔ 3rem, Ctrl/Cmd+B, estado en cookie).
// En móvil el mismo menú se abre como panel deslizante: lo resuelve el propio
// componente `Sidebar` de shadcn, que por debajo usa un Sheet.

import { NavLink, useLocation } from 'react-router'
import { ArrowLeftRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useT } from '../lib/i18n'
import { useAppContext } from '../hooks/useAppContext'
import { navPerRol } from '../lib/nav'
import type { Rol } from '../lib/rols'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'

interface Props {
  /** Badges en vivo: se calculan una sola vez en el shell y se reparten aquí. */
  comptadors: Partial<Record<'aprovacions' | 'missatges', number>>
}

const ETIQUETA_ROL: Record<Rol, string> = {
  intern: 'rol.intern',
  productor: 'rol.productor',
  receptor: 'rol.receptor',
}

export default function AppSidebar({ comptadors }: Props) {
  const { t } = useT()
  const { ctx, rolActiu, setRolActiu, organitzacio } = useAppContext()
  const { setOpenMobile, isMobile } = useSidebar()
  const location = useLocation()

  const grups = navPerRol(rolActiu)
  const titol = organitzacio?.nombre ?? t('app.team')

  // En móvil, elegir una sección cierra el panel; si no, se queda encima del contenido.
  const alNavegar = () => { if (isMobile) setOpenMobile(false) }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 px-3 py-4">
        <NavLink to="/" className="flex items-center gap-2.5 overflow-hidden" onClick={alNavegar}>
          <img src="/logo-poma.svg" alt="POMA" className="h-7 w-auto shrink-0 brightness-0 invert" />
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {titol}
          </span>
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        {grups.map((grup, i) => (
          <SidebarGroup key={grup.titolKey ?? `grup-${i}`}>
            {grup.titolKey && (
              <SidebarGroupLabel className="text-sidebar-foreground/60">
                {t(grup.titolKey)}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {grup.items.map((item) => {
                  const actiu = item.end
                    ? location.pathname === item.to
                    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                  const n = item.comptador ? comptadors[item.comptador] ?? 0 : 0
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={actiu}
                        tooltip={t(item.labelKey)}
                        className={cn(item.primari && 'bg-accent/90 text-white hover:bg-accent')}
                      >
                        <NavLink to={item.to} onClick={alNavegar}>
                          <item.icon />
                          <span>{t(item.labelKey)}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {n > 0 && <SidebarMenuBadge>{n}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Conmutador de panel: solo aparece cuando la cuenta tiene más de un rol. */}
      {ctx && ctx.rols.length > 1 && (
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            {ctx.rols.filter((r) => r !== rolActiu).map((r) => (
              <SidebarMenuItem key={r}>
                <SidebarMenuButton
                  onClick={() => setRolActiu(r)}
                  tooltip={t('nav.switch_panel', { x: t(ETIQUETA_ROL[r]) })}
                >
                  <ArrowLeftRight />
                  <span>{t('nav.switch_panel', { x: t(ETIQUETA_ROL[r]) })}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
