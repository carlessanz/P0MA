// Detalle de una oferta desde el panel del productor: qué publicó, quién se la lleva y
// en qué estado está. Puede cancelarla; editarla no, porque el texto de la oferta ya ha
// circulado por WhatsApp y cambiarlo dejaría a las entidades mirando algo que no existe.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { cancelaOferta } from '../../lib/ofertes'
import { estatEtiqueta } from './Ofertes'
import type { Canalizacion, Excedente } from '../../types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProductorOfertaDetall() {
  const { t } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [oferta, setOferta] = useState<Excedente | null>(null)
  const [canalitzacions, setCanalitzacions] = useState<Canalizacion[]>([])
  const [carregant, setCarregant] = useState(true)

  const carrega = useCallback(async () => {
    if (!id) return
    const [e, c] = await Promise.all([
      supabase.from('excedentes').select('*').eq('id', id).maybeSingle(),
      supabase.from('canalizaciones').select('*').eq('excedente_id', id)
        .order('created_at', { ascending: true }),
    ])
    setOferta((e.data as Excedente) ?? null)
    setCanalitzacions((c.data ?? []) as Canalizacion[])
    setCarregant(false)
  }, [id])

  useEffect(() => { void carrega() }, [carrega])

  async function cancelar() {
    if (!oferta) return
    const motiu = window.prompt(t('po.cancel_reason'))
    if (motiu === null) return
    const r = await cancelaOferta(oferta.id, motiu)
    if (!r.ok) { toast.error(r.error ?? t('c.error')); return }
    toast.success(t('po.cancelled'))
    await carrega()
  }

  if (carregant) return <p className="text-sm text-muted-foreground">{t('c.loading')}</p>
  if (!oferta) return <p className="text-sm text-destructive">{t('od.not_found')}</p>

  const canalitzats = canalitzacions.reduce((s, c) => s + Number(c.kg_confirmados ?? 0), 0)
  const total = Number(oferta.kg_total ?? 0)
  const est = estatEtiqueta(oferta.estado)
  const cancelable = ['borrador', 'publicada', 'parcial'].includes(oferta.estado)

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/productor/ofertes')}
        className="text-muted-foreground">
        <ArrowLeft className="size-4" /> {t('po.list_title')}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold"><code>{oferta.id_excedente}</code></h1>
          <p className="text-sm text-muted-foreground">
            {oferta.producto}{oferta.variedad ? ` · ${oferta.variedad}` : ''}
          </p>
          <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium', est.clase)}>
            {t(est.key)}
          </span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{canalitzats}/{total} kg</div>
          <span className="text-sm text-muted-foreground">
            {total - canalitzats > 0 ? t('off.falten', { n: total - canalitzats }) : t('off.complet')}
          </span>
        </div>
      </div>

      {oferta.texto_oferta && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('od.offer_text')}</CardTitle></CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">
              {oferta.texto_oferta}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{t('po.who_takes')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {canalitzacions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('po.no_channelings')}</p>
          )}
          {canalitzacions.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              {/* El nombre de la entidad no se muestra: el productor no tiene acceso a
                  las fichas de las receptoras (§4bis). La coordinación la hace el equipo. */}
              <span>{t('po.channeled_kg', { n: Number(c.kg_confirmados ?? 0) })}</span>
              {c.kg_reales != null && (
                <span className="text-muted-foreground">{t('po.real_kg', { n: Number(c.kg_reales) })}</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {cancelable && (
        <Button variant="destructive" onClick={() => void cancelar()}>{t('po.cancel_offer')}</Button>
      )}
    </div>
  )
}
