// Asegurar un contacto de WhatsApp antes de abrir la mensajería.
//
// Vivía dentro de App.tsx (`openMessagingWithContact`), donde estaba atado al estado
// raíz. Al pasar a rutas, la parte de datos se queda aquí y la navegación la pone cada
// pantalla: así los listados de productores y entidades siguen con la misma prop.

import { supabase } from './supabase'

/** Crea el `wa_contact` si no existe y sincroniza su nombre. Nunca lanza. */
export async function assegurarContacte(phone: string, name: string | null): Promise<void> {
  if (!phone) return
  const { error } = await supabase.from('wa_contacts').upsert(
    { phone, name, opt_in: true, opt_in_at: new Date().toISOString() },
    { onConflict: 'phone', ignoreDuplicates: true },
  )
  if (error) console.error('wa_contacts upsert:', error.message)
  if (name) {
    const { error: nameError } = await supabase.from('wa_contacts').update({ name }).eq('phone', phone)
    if (nameError) console.error('wa_contacts nombre:', nameError.message)
  }
}
