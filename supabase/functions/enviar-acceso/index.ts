// Envío del acceso a un usuario: enlace mágico por correo y código por WhatsApp.
//
//   POST { email, canal: "email" | "whatsapp" | "ambos" }
//
// Sigue el patrón obligatorio del proyecto (§9): el enlace se genera con la Admin API
// (`generateLink`, que NO envía nada) y se manda por **Resend**. El mailer nativo de
// Supabase Auth sigue prohibido.
//
// POR QUÉ POR WHATSAPP VA EL CÓDIGO Y NO EL ENLACE:
//   · un enlace mágico es una credencial al portador: un clic y hay sesión
//   · `sendText()` guarda el cuerpo en `wa_messages`, tabla que el equipo lee desde
//     Mensajería, así que el enlace quedaría publicado en la consola
//   Se manda `email_otp` (6 cifras, un solo uso, 1 hora) y se redacta el cuerpo que se
//   registra. Sin saber el correo, el código no sirve de nada.
//
// LÍMITES REALES DEL CANAL WHATSAPP (§8): solo llega si el número está en
// `meta_test_recipients`, pertenece a una ficha `es_test` y **ha escrito en las últimas
// 24 h** (fuera de la ventana solo entran plantillas aprobadas, y la única que hay es
// `hello_world`, que no admite variables). Para el resto de las cuentas: correo.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { escaparHtml, plantillaEmail, sendEmail } from "../_shared/resend.ts";
import { sendText } from "../_shared/whatsapp.ts";
import { exigirEquipo } from "../_shared/autorizacion.ts";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173")
  .split(",").map((o) => o.trim()).filter(Boolean);

function originPermitido(origin: string): boolean {
  return ALLOWED_ORIGINS.some((patron) => {
    if (!patron.includes("*")) return patron === origin;
    const re = new RegExp(
      "^" + patron.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[A-Za-z0-9-]+") + "$",
    );
    return re.test(origin);
  });
}

function corsPara(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": originPermitido(origin) ? origin : ALLOWED_ORIGINS[0],
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = corsPara(req);
  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return responder({ error: "Method Not Allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SB_SECRET_KEY")!,
  );

  const auth = await exigirEquipo(supabase, req);
  if ("rechazo" in auth) {
    const { error, code, status } = auth.rechazo;
    return responder({ error, code }, status);
  }

  try {
    const { email, canal = "email" } = await req.json();
    if (!email || typeof email !== "string") {
      return responder({ error: "Falta 'email'" }, 400);
    }

    // Solo se manda acceso a cuentas que ya existen y tienen perfil: esta función no
    // da de alta a nadie.
    const { data: perfil } = await supabase
      .from("perfiles").select("id, email, nombre, telefono, activo")
      .ilike("email", email).maybeSingle();
    if (!perfil) return responder({ error: "No hay ninguna cuenta con ese correo" }, 404);
    if (perfil.activo === false) return responder({ error: "La cuenta está desactivada" }, 409);

    const redirectTo = Deno.env.get("APP_URL") ?? ALLOWED_ORIGINS[0];
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) {
      console.error("generateLink:", error.message);
      return responder({ error: "No se pudo generar el enlace" }, 500);
    }
    const props = data?.properties as { action_link?: string; email_otp?: string } | undefined;
    const enlace = props?.action_link;
    const codi = props?.email_otp;
    if (!enlace || !codi) return responder({ error: "Enlace incompleto" }, 500);

    const resultado: Record<string, unknown> = { ok: true };

    // --- Correo: enlace + código como alternativa -----------------------------
    if (canal === "email" || canal === "ambos") {
      const salutacio = perfil.nombre ? `Hola ${escaparHtml(perfil.nombre)},` : "Hola,";
      const html = plantillaEmail({
        titulo: "El teu accés a POMA",
        preheader: "Enllaç d'accés directe (caduca en 1 hora) i codi alternatiu.",
        cuerpoHtml: `<p style="margin:0 0 12px">${salutacio}</p>` +
          `<p style="margin:0">Ja pots entrar al panell de POMA. L'enllaç caduca en <strong>1 hora</strong> i només es pot fer servir una vegada.</p>`,
        boton: { texto: "Entra a POMA", url: enlace },
        nota:
          `Si el botó no funciona, entra a <a href="${redirectTo}" style="color:#234C66">${
            redirectTo.replace(/^https?:\/\//, "")
          }</a>, escriu el teu correu i fes servir aquest codi:<br>` +
          `<span style="display:inline-block;margin-top:10px;padding:8px 14px;background:#F1F4F0;border-radius:8px;font-size:20px;font-weight:700;letter-spacing:4px;color:#234C66">${codi}</span>`,
      });
      const r = await sendEmail({
        to: email,
        subject: "El teu accés a POMA",
        html,
        text: `Accés a POMA: ${enlace}\n\nCodi alternatiu: ${codi} (caduca en 1 hora).`,
      });
      resultado.email = r.ok ? "enviat" : `error: ${JSON.stringify(r.data)}`;
    }

    // --- WhatsApp: SOLO el código, y con el cuerpo redactado en la consola -----
    if (canal === "whatsapp" || canal === "ambos") {
      if (!perfil.telefono) {
        resultado.whatsapp = "sense telèfon al perfil";
      } else {
        const r = await sendText(
          supabase,
          perfil.telefono,
          `El teu codi d'accés a POMA és ${codi}. Caduca en 1 hora. ` +
            `Entra a ${redirectTo}, escriu el teu correu i el codi.`,
          { bodyConsola: "[codi d'accés enviat · ocult]" },
        );
        resultado.whatsapp = r.ok ? "enviat" : `error: ${JSON.stringify(r.data)}`;
      }
    }

    return responder(resultado, 200);
  } catch (err) {
    console.error("enviar-acceso:", err instanceof Error ? err.message : String(err));
    return responder({ error: "Error interno o JSON inválido" }, 500);
  }
});
