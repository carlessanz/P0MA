// Política de canal: por dónde se contacta a un productor o a un receptor.
//
// REGLA (2026-07-30): **el correo es el canal por defecto.** WhatsApp solo se usa
// cuando de verdad se puede: hace falta un móvil Y, o bien un opt-in explícito, o
// bien la ventana de servicio de 24 h abierta (que es la persona escribiéndonos a
// nosotros, así que el consentimiento es implícito y el envío es gratis). En
// cualquier otro caso —sin teléfono, con un fijo, sin opt-in y sin ventana— se cae
// al correo. Así nadie se queda sin recibir la oferta porque su ficha no tenga
// WhatsApp o no lo haya aceptado nunca.
//
// Función PURA, sin red: recibe los datos ya cargados y decide. Igual que
// `priorizacion.ts`, para poder razonarla y probarla aislada. Quién PUEDE recibir
// es otra cosa y vive en `gate.ts` (es_test + modo test): esto decide el canal,
// aquel decide el permiso. Los dos se aplican; ninguno sustituye al otro.

export type Canal = "whatsapp" | "email" | "cap";

/** Ventana de servicio de WhatsApp: 24 h desde el último mensaje del contacto. */
export const VENTANA_MS = 24 * 60 * 60 * 1000;

export interface DatosContacto {
  telefono?: string | null;
  email?: string | null;
  /** De `wa_contacts`: consentimiento explícito para plantillas. */
  opt_in?: boolean | null;
  /** De `wa_contacts`: última vez que el contacto nos escribió. */
  last_inbound_at?: string | null;
}

/** Códigos estables (los traduce el frontend); el texto es el respaldo en català. */
export type MotivoCanal =
  | "finestra_oberta"
  | "opt_in"
  | "sense_telefon"
  | "telefon_no_mobil"
  | "sense_optin_ni_finestra"
  | "sense_correu"
  | "sense_canal";

export interface DecisionCanal {
  canal: Canal;
  /** Por qué se ha elegido ese canal (o por qué no hay ninguno). */
  motivo: MotivoCanal;
  /** Motivo por el que WhatsApp no es viable, cuando no lo es. */
  motivoWhatsapp: MotivoCanal | null;
  whatsappPosible: boolean;
  emailPosible: boolean;
}

/**
 * ¿Este número puede recibir WhatsApp? Un fijo no, y en el import de ARA hay 6
 * (§6). Fuera de España no se puede saber por el prefijo, así que se acepta:
 * más vale intentarlo y que Meta lo rechace que descartarlo por nuestra cuenta.
 */
export function esMovil(telefono: string | null | undefined): boolean {
  const t = (telefono ?? "").replace(/\D/g, "");
  if (t.length < 9) return false;
  if (t.startsWith("34")) return /^34[67]/.test(t); // móviles españoles: 6xx y 7xx
  return true;
}

export function ventanaAbierta(lastInboundAt: string | null | undefined, ahora = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) && ahora - t <= VENTANA_MS;
}

export function decidirCanal(d: DatosContacto, ahora = Date.now()): DecisionCanal {
  const telefono = (d.telefono ?? "").trim();
  const email = (d.email ?? "").trim();
  const emailPosible = email.includes("@");

  let whatsappPosible = false;
  let motivoWhatsapp: MotivoCanal | null = null;
  let motivoWa: MotivoCanal = "sense_telefon";

  if (!telefono) {
    motivoWhatsapp = "sense_telefon";
  } else if (!esMovil(telefono)) {
    motivoWhatsapp = "telefon_no_mobil";
  } else if (ventanaAbierta(d.last_inbound_at, ahora)) {
    // Nos ha escrito hace menos de 24 h: texto libre permitido y gratis (§8).
    whatsappPosible = true;
    motivoWa = "finestra_oberta";
  } else if (d.opt_in === true) {
    // Sin ventana solo entran plantillas, y esas sí exigen consentimiento.
    whatsappPosible = true;
    motivoWa = "opt_in";
  } else {
    motivoWhatsapp = "sense_optin_ni_finestra";
  }

  if (whatsappPosible) {
    return { canal: "whatsapp", motivo: motivoWa, motivoWhatsapp: null, whatsappPosible, emailPosible };
  }
  if (emailPosible) {
    // El correo es el canal por defecto: el motivo que se enseña es POR QUÉ no
    // ha sido WhatsApp, que es lo que el equipo necesita saber.
    return { canal: "email", motivo: motivoWhatsapp!, motivoWhatsapp, whatsappPosible, emailPosible };
  }
  return {
    canal: "cap",
    motivo: telefono || email ? "sense_canal" : "sense_canal",
    motivoWhatsapp,
    whatsappPosible,
    emailPosible,
  };
}
