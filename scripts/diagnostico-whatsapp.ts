// Diagnóstico de la conexión con la Cloud API de Meta.
//
//   WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... deno run -A scripts/diagnostico-whatsapp.ts
//
// Existe porque el 31-07-2026 WhatsApp dejó de enviar y desde fuera no se podía
// distinguir "el token ha caducado" de "el número ya no es nuestro" de "la app ha
// perdido permisos": la app solo veía un `100/33` opaco. Este script interroga a
// Meta y dice cuál de las tres es.
//
// Los valores están en los secretos de Supabase; se leen del panel de Meta o con
// `supabase secrets list` (que da los nombres, no los valores: hay que copiarlos
// de donde se guardaron). NO se escribe nada: solo consulta.

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v23.0";

if (!TOKEN) {
  console.error(`
Falta WHATSAPP_TOKEN.

  WHATSAPP_TOKEN='EAA...' WHATSAPP_PHONE_ID='1244948805365220' \\
    deno run -A scripts/diagnostico-whatsapp.ts
`);
  Deno.exit(1);
}

const G = `https://graph.facebook.com/${VERSION}`;

async function get(ruta: string): Promise<{ ok: boolean; status: number; data: any }> {
  const url = ruta.startsWith("http") ? ruta : `${G}/${ruta}`;
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(TOKEN)}`);
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

function titulo(s: string) {
  console.log(`\n\x1b[1m${s}\x1b[0m\n${"─".repeat(s.length)}`);
}

// --- 1. ¿El token es válido, y hasta cuándo? --------------------------------
// Distingue lo que la app no puede: un 190 aquí es token caducado/revocado; que
// el token valga y aun así falle el envío apunta a permisos, no a caducidad.
titulo("1. El token");
const dbg = await get(`debug_token?input_token=${encodeURIComponent(TOKEN)}`);
if (!dbg.ok) {
  console.log(`  ✗ No se puede inspeccionar: ${dbg.data?.error?.message ?? dbg.status}`);
  console.log(`    (debug_token normalmente exige un token de app; no es concluyente)`);
} else {
  const d = dbg.data?.data ?? {};
  const caduca = d.expires_at ? new Date(d.expires_at * 1000) : null;
  console.log(`  válido:      ${d.is_valid ? "SÍ" : "NO"}`);
  console.log(`  tipo:        ${d.type ?? "?"}`);
  console.log(`  app:         ${d.app_id ?? "?"}`);
  console.log(`  caduca:      ${caduca ? caduca.toLocaleString() : "nunca (permanente)"}`);
  if (caduca && caduca.getTime() < Date.now()) console.log(`  ⚠️  CADUCADO`);
  const scopes: string[] = d.scopes ?? [];
  console.log(`  permisos:    ${scopes.join(", ") || "(ninguno)"}`);
  for (const nec of ["whatsapp_business_messaging", "whatsapp_business_management"]) {
    if (!scopes.includes(nec)) console.log(`  ⚠️  FALTA el permiso ${nec}`);
  }
}

// --- 2. ¿El phone_id existe y es accesible con ESTE token? ------------------
titulo("2. El número que usa la app para enviar");
if (!PHONE_ID) {
  console.log("  (sin WHATSAPP_PHONE_ID: se salta)");
} else {
  const p = await get(`${PHONE_ID}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`);
  if (p.ok) {
    console.log(`  ✓ ${PHONE_ID} accesible`);
    for (const [k, v] of Object.entries(p.data ?? {})) console.log(`      ${k}: ${v}`);
  } else {
    const e = p.data?.error ?? {};
    console.log(`  ✗ ${PHONE_ID} NO accesible — HTTP ${p.status}`);
    console.log(`      code ${e.code}, subcode ${e.error_subcode ?? "—"}: ${e.message}`);
    if (e.code === 190) {
      console.log(`  → El TOKEN ya no vale. Genera uno nuevo y actualiza el secreto.`);
    } else if (e.code === 100 && e.error_subcode === 33) {
      console.log(`  → El token es válido pero NO tiene acceso a este número:`);
      console.log(`    o el número se movió de WABA, o la app perdió el permiso, o el`);
      console.log(`    phone_id ya no es el correcto. Mira la lista del punto 3.`);
    }
  }
}

// --- 3. ¿A qué números SÍ tiene acceso este token? -------------------------
// Si aquí aparece un phone_id distinto del configurado, ese es el fallo entero:
// el número cambió y el secreto se quedó apuntando al viejo.
titulo("3. Números a los que este token SÍ llega");
const negocios = await get("me/businesses?fields=id,name");
if (!negocios.ok) {
  console.log(`  ✗ ${negocios.data?.error?.message ?? negocios.status}`);
  console.log(`    (normal si el token es de usuario de sistema con permisos acotados)`);
} else {
  const lista = negocios.data?.data ?? [];
  if (!lista.length) console.log("  (ninguna empresa visible con este token)");
  for (const b of lista) {
    console.log(`  Empresa ${b.name} (${b.id})`);
    const wabas = await get(`${b.id}/owned_whatsapp_business_accounts?fields=id,name`);
    for (const w of wabas.data?.data ?? []) {
      console.log(`    WABA ${w.name ?? ""} (${w.id})`);
      const nums = await get(`${w.id}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type`);
      for (const n of nums.data?.data ?? []) {
        const marca = n.id === PHONE_ID ? "  ← el configurado" : "";
        console.log(`      · ${n.id}  ${n.display_phone_number}  ${n.verified_name ?? ""}${marca}`);
      }
      if (!(nums.data?.data ?? []).length) console.log(`      (sin números)`);
    }
  }
}

titulo("Qué hacer con esto");
console.log(`
  · Token caducado o inválido (code 190) → genera uno nuevo en developers.facebook.com
    y actualízalo:   supabase secrets set WHATSAPP_TOKEN='EAA...'

  · El punto 3 muestra un phone_id DISTINTO del configurado → el número cambió:
    supabase secrets set WHATSAPP_PHONE_ID='<el nuevo>'

  · El token vale y el número también, pero el envío sigue fallando → mira si la
    app tiene la WABA suscrita y si el número está en el entorno de test con sus
    ≤5 destinatarios verificados (tabla meta_test_recipients, AGENTS.md §8).

  Tras cambiar cualquier secreto hay que REDESPLEGAR las funciones que lo usan:
    supabase functions deploy whatsapp-send
    supabase functions deploy whatsapp-webhook --no-verify-jwt
    supabase functions deploy intake-recordatorios --no-verify-jwt
`);
