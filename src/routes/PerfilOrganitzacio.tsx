// Ficha de la propia organización, para productor y receptor.
//
// No usa `RecordDetail` (que escribe directo en la tabla) porque un usuario externo no
// tiene permiso de UPDATE sobre `productores`/`entidades`: escribe por RPC con lista
// blanca de columnas, para que nadie pueda tocar `es_test`, `codigo` o `conveni`
// desde su panel (§4bis). Y solo el titular puede guardar.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { useAppContext } from '../hooks/useAppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Fila = Record<string, unknown>

/** Campos editables por tipo: los mismos que acepta la RPC correspondiente. */
const CAMPS = {
  productor: [
    { clave: 'name', labelKey: 'f.name', arg: 'p_name' },
    { clave: 'empresa', labelKey: 'f.empresa', arg: 'p_empresa' },
    { clave: 'email', labelKey: 'f.email', arg: 'p_email' },
    { clave: 'phone', labelKey: 'f.phone', arg: 'p_phone' },
    { clave: 'telefono_alt', labelKey: 'f.telefono_alt', arg: 'p_telefono_alt' },
    { clave: 'nif', labelKey: 'f.nif', arg: 'p_nif' },
    { clave: 'direccion', labelKey: 'f.direccion', arg: 'p_direccion' },
    { clave: 'codigo_postal', labelKey: 'f.codigo_postal', arg: 'p_codigo_postal' },
    { clave: 'poblacion', labelKey: 'f.poblacion', arg: 'p_poblacion' },
    { clave: 'area_geografica', labelKey: 'f.area_geografica', arg: 'p_area' },
  ],
  entidad: [
    { clave: 'nombre', labelKey: 'f.nombre', arg: 'p_nombre' },
    { clave: 'contacto', labelKey: 'f.contacto', arg: 'p_contacto' },
    { clave: 'telefono', labelKey: 'f.phone', arg: 'p_telefono' },
    { clave: 'email', labelKey: 'f.email', arg: 'p_email' },
    { clave: 'direccion', labelKey: 'f.direccion', arg: 'p_direccion' },
    { clave: 'codigo_postal', labelKey: 'f.codigo_postal', arg: 'p_codigo_postal' },
    { clave: 'poblacion', labelKey: 'f.poblacion', arg: 'p_poblacion' },
    { clave: 'horario', labelKey: 'f.horario', arg: 'p_horario' },
    { clave: 'calendari_repartiment', labelKey: 'f.calendari_repartiment', arg: 'p_calendari' },
  ],
} as const

export default function PerfilOrganitzacio() {
  const { t } = useT()
  const { organitzacio } = useAppContext()
  const [fila, setFila] = useState<Fila | null>(null)
  const [carregant, setCarregant] = useState(true)
  const [desant, setDesant] = useState(false)

  const tipo = organitzacio?.tipo === 'productor' ? 'productor' : 'entidad'
  const tabla = tipo === 'productor' ? 'productores' : 'entidades'
  const camps = CAMPS[tipo]
  const potEditar = organitzacio?.rol_org === 'titular'

  useEffect(() => {
    if (!organitzacio) { setCarregant(false); return }
    let viu = true
    void supabase.from(tabla).select('*').eq('id', organitzacio.id).maybeSingle()
      .then(({ data }) => {
        if (!viu) return
        setFila((data as Fila) ?? null)
        setCarregant(false)
      })
    return () => { viu = false }
  }, [organitzacio, tabla])

  async function desa() {
    if (!organitzacio || !fila) return
    setDesant(true)
    const args: Record<string, unknown> = { p_id: organitzacio.id }
    for (const c of camps) args[c.arg] = (fila[c.clave] as string) || null
    const { error } = await supabase.rpc(
      tipo === 'productor' ? 'actualizar_mi_productor' : 'actualizar_mi_entidad', args)
    setDesant(false)
    if (error) { toast.error(error.message); return }
    toast.success(t('rec.saved'))
  }

  if (!organitzacio) return <p className="text-sm text-muted-foreground">{t('po.no_org')}</p>
  if (carregant) return <p className="text-sm text-muted-foreground">{t('c.loading')}</p>

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{organitzacio.nombre ?? t('nav.my_org')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {potEditar ? t('perf.subtitle') : t('perf.read_only')}
          </p>
        </div>
        {potEditar && (
          <Button onClick={() => void desa()} disabled={desant}>
            {desant ? t('c.saving') : t('c.save')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {camps.map((c) => (
            <div key={c.clave}>
              <Label className="mb-1.5 block text-xs text-muted-foreground">{t(c.labelKey)}</Label>
              <Input
                value={String(fila?.[c.clave] ?? '')}
                disabled={!potEditar}
                onChange={(e) => setFila((f) => ({ ...(f ?? {}), [c.clave]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
