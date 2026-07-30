// Cola global de aprobaciones.
//
// Hasta ahora las aceptaciones pendientes solo se veían entrando en cada oferta. Con
// receptores aceptando desde su panel (canal 'panel') la cola crece sin que nadie la
// mire, así que aquí están todas juntas. Aprobar sigue haciéndose en el detalle de la
// oferta, donde está el contexto (kg que faltan, preu, resto de respuestas).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Fila {
  id: string
  excedente_id: string
  kg_solicitados: number | null
  preu_ofert: number | null
  canal: string
  respondido_at: string | null
  enviado_at: string
  entidades: { nombre: string; poblacion: string | null } | null
  excedentes: { id_excedente: string | null; producto: string | null; kg_total: number | null } | null
}

function quan(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ` +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function Aprovacions() {
  const { t } = useT()
  const navigate = useNavigate()
  const [files, setFiles] = useState<Fila[]>([])
  const [carregant, setCarregant] = useState(true)

  const carrega = useCallback(async () => {
    const { data } = await supabase
      .from('oferta_respuestas')
      .select('id, excedente_id, kg_solicitados, preu_ofert, canal, respondido_at, enviado_at, ' +
        'entidades(nombre, poblacion), excedentes(id_excedente, producto, kg_total)')
      .eq('estado', 'acceptada')
      .eq('aprovacio', 'pendent')
      .order('respondido_at', { ascending: true, nullsFirst: false })
    setFiles((data as unknown as Fila[]) ?? [])
    setCarregant(false)
  }, [])

  useEffect(() => {
    void carrega()
    const canal = supabase
      .channel('aprovacions-pendents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oferta_respuestas' },
        () => void carrega())
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [carrega])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appr.title')}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{t('appr.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {carregant && <p className="text-sm text-muted-foreground">{t('c.loading')}</p>}
        {!carregant && files.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('appr.empty')}</p>
        )}
        {files.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="font-medium">
                {f.entidades?.nombre ?? '—'}
                {f.entidades?.poblacion ? ` · ${f.entidades.poblacion}` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                <code>{f.excedentes?.id_excedente ?? '—'}</code> · {f.excedentes?.producto ?? '—'}
                {f.kg_solicitados != null ? ` · ${f.kg_solicitados} ${t('od.rs_kg')}` : ''}
                {f.preu_ofert != null ? ` · ${f.preu_ofert} ${t('od.rs_preu')}` : ''}
                {` · ${t(`od.ch_${f.canal}`)} · ${quan(f.respondido_at ?? f.enviado_at)}`}
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/equip/ofertes/${f.excedente_id}`)}>
              {t('appr.open')}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
