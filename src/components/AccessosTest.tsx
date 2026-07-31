// Botones de «entrar como…» para las cuentas de prueba.
//
// No navega: abre sesión y ya está. Quien monta esta tarjeta (LoginUsuaris) observa la
// sesión y redirige, igual que hace con el formulario normal.

import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { GRUPS_ACCESSOS } from '../lib/accessosTest'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AccessosTest() {
  const { t } = useT()
  const [ocupat, setOcupat] = useState<string | null>(null)

  async function entrar(email: string, password: string) {
    if (ocupat) return
    setOcupat(email)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setOcupat(null)
    if (error) toast.error(error.message)
  }

  return (
    <Card className="mt-4 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">{t('test.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('test.hint')}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {GRUPS_ACCESSOS.map((grup) => (
          <div key={grup.titolKey} className="grid gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(grup.titolKey)}
            </p>
            {grup.comptes.map((compte) => (
              <Button
                key={compte.email}
                variant="outline"
                className="h-auto w-full flex-col items-start gap-0 py-2 text-left"
                disabled={ocupat !== null}
                onClick={() => void entrar(compte.email, compte.password)}
              >
                <span className="font-medium">{compte.organitzacio}</span>
                <span className="text-xs font-normal text-muted-foreground">{compte.tipus}</span>
              </Button>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
