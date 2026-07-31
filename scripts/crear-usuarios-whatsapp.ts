// Cuentas de ORGANIZACIÓN para cinco fichas REALES del equipo de Espigoladors.
//
//   SUPABASE_URL=... SB_SECRET_KEY=... deno run -A scripts/crear-usuarios-whatsapp.ts [--dry-run]
//
// POR QUÉ EXISTE
// -------------------------------------------------------------------------------
// Cinco personas del equipo ya tienen ficha (`productores` y/o `entidades`) marcada
// `es_test` y con el teléfono verificado en Meta, así que son las únicas a las que
// hoy se les puede mandar un WhatsApp de verdad (§8). Pero no tienen cuenta DE
// ORGANIZACIÓN: tres de ellas solo tienen cuenta de EQUIPO (super_admin/admin), y
// esas credenciales no pueden ir a los accesos directos del login porque quien entre
// con ellas ve las 452 fichas reales. Este script crea la otra mitad: una cuenta
// `hola+wa-…@carlessanz.com` SIN rol de plataforma, enlazada por `membresias` a la
// ficha de esa misma persona.
//
// QUÉ EXPONE
// -------------------------------------------------------------------------------
// Quien entre con una de estas cuentas ve **la ficha de esa persona** —su nombre, su
// correo de trabajo y su móvil— y las ofertas que le correspondan por su rol. Nada
// más: las políticas por organización (§4bis) filtran el resto de la base.
// ⚠️ Eso vale mientras `app_settings.roles_activos` esté en `'true'`. El modelo de
//    roles es fail-open a propósito: con el interruptor apagado, estas cuentas —como
//    cualquier otra autenticada— lo verían todo. Compruébalo antes de repartir nada:
//    `deno run -A scripts/roles-activos.ts estat`.
//
// EN QUÉ SE DIFERENCIA DE `crear-usuarios-prueba.ts`
// -------------------------------------------------------------------------------
// Aquel monta un fixture: inventa seis organizaciones ficticias TEST-* y las crea si
// no están. Este NO CREA NI MODIFICA NINGUNA FICHA, nunca. Solo hace `select` sobre
// `productores`/`entidades` buscando por correo, y si una ficha esperada no aparece
// avisa y sigue con las demás; al terminar devuelve código de salida != 0 para que se
// note. Escribir aquí una ficha sería peor que no hacer nada: son organizaciones
// reales, con teléfonos reales, y un `insert` a ciegas dejaría un duplicado en la
// tabla que alimenta la priorización y los gates de envío.
//
// DOBLE ROL REAL
// -------------------------------------------------------------------------------
// Cuatro de las cinco personas tienen ficha de productor Y de entidad, así que su
// cuenta queda con dos membresías y con los dos paneles (productor + receptor). Es un
// caso que hasta ahora no se ejercitaba nunca: el fixture da una organización por
// cuenta, y el conmutador de panel del menú lateral (§6ter) no se había probado con
// datos reales. Aquí sí.
//
// Las contraseñas se muestran UNA sola vez por pantalla y no se guardan en ningún
// fichero. Reejecutar el script NO las cambia: si la cuenta ya existe, se reutiliza.

import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SB_SECRET_KEY");
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SB_SECRET_KEY en el entorno.");
  console.error("La secret key (sb_secret_...) está en el Dashboard → Settings → API Keys.");
  Deno.exit(1);
}
const dryRun = Deno.args.includes("--dry-run");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// El fixture, declarativo: se lee de un vistazo y es su propia documentación
// ---------------------------------------------------------------------------

const BASE = "hola";
const DOMINIO = "carlessanz.com";
const correo = (sufijo: string) => `${BASE}+${sufijo}@${DOMINIO}`;

type TipoFicha = "productor" | "entidad";

interface Persona {
  /** Correo de la cuenta NUEVA. NO es el correo de la ficha: son cosas distintas. */
  cuenta: string;
  /** Nombre de la persona, tal y como se espera encontrarlo en la ficha. */
  persona: string;
  /**
   * Correo de la PERSONA en su ficha de productor. Es la clave de búsqueda: el
   * `codigo` no lo tienen todas las fichas importadas y el nombre no es estable
   * («Carles Sanz» / «Carles Sanz Vila» / la empresa). Ojo: en tres de los cinco
   * casos este correo es además el de una cuenta de EQUIPO, que no es esta.
   */
  emailProductor?: string;
  /** Ídem para su ficha de entidad receptora. */
  emailEntidad?: string;
  /** Aviso que sale en el bloque de credenciales. */
  aviso?: string;
}

const PERSONAS: Persona[] = [
  {
    cuenta: correo("wa-carles"),
    persona: "Carles Sanz",
    emailProductor: "hola@carlessanz.com",
    emailEntidad: "hola@carlessanz.com",
  },
  {
    cuenta: correo("wa-sebas"),
    persona: "Sebas Sale",
    emailProductor: "sebastian@espigoladors.com",
    emailEntidad: "sebastian@espigoladors.com",
  },
  {
    cuenta: correo("wa-raquel"),
    persona: "Raquel Diaz",
    emailProductor: "raquel@espigoladors.com",
    emailEntidad: "raquel@espigoladors.com",
  },
  {
    // La única sin ficha de productor: solo receptora.
    cuenta: correo("wa-anna"),
    persona: "Anna Garreta",
    emailEntidad: "comunicacio@esimperfect.com",
  },
  {
    cuenta: correo("wa-laura"),
    persona: "Laura Masdeu",
    emailProductor: "laura@espigoladors.com",
    emailEntidad: "laura@espigoladors.com",
    aviso: "sin teléfono y fuera de la whitelist de Meta: sirve para el PANEL, NO para probar WhatsApp",
  },
];

/** Nombre del perfil: deja claro que es la cuenta de prueba de esa persona. */
const nombrePerfil = (p: Persona) => `${p.persona} (prova WhatsApp)`;

// ---------------------------------------------------------------------------
// Auxiliares (mismos que scripts/crear-usuarios-prueba.ts)
// ---------------------------------------------------------------------------

function generarPassword(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const chars = [...bytes].map((b) => abc[b % abc.length]);
  // En grupos de cinco, para poder dictarla sin errores.
  return [0, 5, 10].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

/** Busca una cuenta por correo paginando (la Admin API no filtra por email). */
async function buscaUsuari(email: string): Promise<string | null> {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || !data.users.length) return null;
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Escapa los comodines de LIKE. Un correo como `a_b@x.com` buscado con `ilike` sin
 * escapar casaría también con `axb@x.com`, y aquí una coincidencia de más significa
 * enlazar la cuenta a la ficha de OTRA organización.
 */
function patronLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Lectura de las fichas reales (solo SELECT; este script no las toca nunca)
// ---------------------------------------------------------------------------

interface Ficha {
  tipo: TipoFicha;
  id: string;
  nombre: string;
  esTest: boolean;
  telefono: string | null;
}

async function buscaFichas(tipo: TipoFicha, email: string): Promise<Ficha[]> {
  const tabla = tipo === "productor" ? "productores" : "entidades";
  const campoNombre = tipo === "productor" ? "name" : "nombre";
  const campoTel = tipo === "productor" ? "phone" : "telefono";

  const { data, error } = await admin
    .from(tabla)
    .select(`id, ${campoNombre}, email, es_test, ${campoTel}`)
    .ilike("email", patronLike(email));

  if (error) {
    console.error(`    ✗ ${tipo}: error leyendo ${tabla}: ${error.message}`);
    return [];
  }

  // Segunda pasada en JS: `ilike` compara con un PATRÓN, y PostgREST además convierte
  // `*` en `%` por su cuenta. Con la igualdad exacta (insensible a mayúsculas) aquí,
  // ningún comodín que se escapara puede colar una ficha ajena.
  const filas = (data ?? []) as Record<string, unknown>[];
  return filas
    .filter((f) => String(f.email ?? "").trim().toLowerCase() === email.trim().toLowerCase())
    .map((f) => ({
      tipo,
      id: String(f.id),
      nombre: String(f[campoNombre] ?? "").trim(),
      esTest: f.es_test === true,
      telefono: f[campoTel] ? String(f[campoTel]).trim() : null,
    }));
}

/** Qué paneles verá la cuenta, según las fichas que se hayan podido enlazar. */
function describePaneles(fichas: Ficha[]): string {
  const productor = fichas.some((f) => f.tipo === "productor");
  const receptor = fichas.some((f) => f.tipo === "entidad");
  if (productor && receptor) return "productor + receptor";
  if (productor) return "solo productor";
  if (receptor) return "solo receptor";
  return "sin panel";
}

/**
 * Membresía titular con la ficha. Idempotente: busca por (user_id, FK), que es
 * justo el índice único de `membresias`.
 *
 * NO escribe `aprovacio`: el default de la columna ('aprovada') es el correcto para
 * un alta hecha a mano, y pisarlo sería reabrir una decisión del equipo. Por lo mismo,
 * si la fila ya existe y NO está aprobada, no se toca: forzar `activo = true` sobre
 * una membresía `pendent`/`rebutjada` violaría además el check
 * `aprovacio = 'aprovada' or activo = false` (20260731100000).
 */
async function asseguraMembresia(userId: string, ficha: Ficha): Promise<void> {
  const columna = ficha.tipo === "productor" ? "productor_id" : "entidad_id";

  const { data: existente, error: errBusca } = await admin
    .from("membresias")
    .select("id, activo, rol_org, aprovacio")
    .eq("user_id", userId)
    .eq(columna, ficha.id)
    .maybeSingle();

  if (errBusca) {
    console.error(`    ! membresía ${ficha.tipo}: ${errBusca.message}`);
    if (errBusca.message.includes("aprovacio")) {
      console.error("      ↳ falta aplicar la migración 20260731100000_registre_public.sql");
    }
    return;
  }

  if (existente) {
    const previa = existente as { id: string; activo: boolean; rol_org: string; aprovacio: string };
    if (previa.aprovacio !== "aprovada") {
      console.log(`    · membresía ${ficha.tipo}: ya existe y está «${previa.aprovacio}» → no se toca`);
      return;
    }
    const { error } = await admin
      .from("membresias")
      .update({ rol_org: "titular", activo: true })
      .eq("id", previa.id);
    if (error) console.error(`    ! membresía ${ficha.tipo}: ${error.message}`);
    else console.log(`    ✓ membresía ${ficha.tipo} (ya existía, titular/activa)`);
    return;
  }

  const { error } = await admin.from("membresias").insert({
    user_id: userId,
    tipo: ficha.tipo,
    productor_id: ficha.tipo === "productor" ? ficha.id : null,
    entidad_id: ficha.tipo === "entidad" ? ficha.id : null,
    rol_org: "titular",
    activo: true,
  });
  if (error) console.error(`    ! membresía ${ficha.tipo}: ${error.message}`);
  else console.log(`    ✓ membresía ${ficha.tipo} · titular`);
}

// ---------------------------------------------------------------------------
// 1. Fichas
// ---------------------------------------------------------------------------

console.log(`\n${dryRun ? "SIMULACIÓN — no se escribe nada\n" : ""}1. Fichas reales (solo lectura: este script NUNCA crea ni modifica una ficha)`);

// La whitelist de Meta se lee para informar, no para escribir: con el número en el
// entorno de test, quien no esté aquí no recibe nada (error 131030). Si la tabla
// está vacía no restringe (§4).
const numerosMeta = new Set<string>();
{
  const { data, error } = await admin.from("meta_test_recipients").select("phone");
  if (error) console.error(`  ! no se pudo leer meta_test_recipients: ${error.message}`);
  else for (const r of (data ?? []) as { phone: string }[]) numerosMeta.add(r.phone);
}

/** Cómo se ve el teléfono de una ficha desde el punto de vista del envío. */
function estadoTelefono(ficha: Ficha): string {
  if (!ficha.telefono) return "sin teléfono ← con esta ficha no se puede probar WhatsApp";
  if (numerosMeta.size === 0) return `${ficha.telefono} (la lista de Meta está vacía: no restringe)`;
  return numerosMeta.has(ficha.telefono)
    ? `${ficha.telefono} ✓ en la lista de Meta`
    : `${ficha.telefono} ← NO está en la lista de Meta: Meta lo rechazará con 131030`;
}

interface Resuelta {
  persona: Persona;
  fichas: Ficha[];
}

const resueltas: Resuelta[] = [];
let faltan = 0;

for (const persona of PERSONAS) {
  console.log(`\n  ${persona.persona} → ${persona.cuenta}`);
  const fichas: Ficha[] = [];

  const esperadas: [TipoFicha, string | undefined][] = [
    ["productor", persona.emailProductor],
    ["entidad", persona.emailEntidad],
  ];

  for (const [tipo, email] of esperadas) {
    if (!email) continue;

    let candidatas = await buscaFichas(tipo, email);

    // `entidades.email` NO es único (a diferencia de `productores.email`), así que
    // dos fichas pueden compartir el correo de la persona de contacto. Se intenta
    // desempatar por nombre y, si sigue habiendo duda, se para: enlazar la cuenta a
    // la ficha equivocada es exactamente lo que no puede pasar.
    if (candidatas.length > 1) {
      const porNombre = candidatas.filter(
        (f) => f.nombre.toLowerCase() === persona.persona.toLowerCase(),
      );
      if (porNombre.length === 1) candidatas = porNombre;
    }

    if (candidatas.length === 0) {
      console.log(`    ✗ ${tipo}: no hay ninguna ficha con ${email} → se salta (NO se crea)`);
      faltan++;
      continue;
    }
    if (candidatas.length > 1) {
      console.log(`    ✗ ${tipo}: ${candidatas.length} fichas comparten ${email} → ambiguo, se salta`);
      for (const c of candidatas) console.log(`        · ${c.nombre} · ${c.id}`);
      faltan++;
      continue;
    }

    const ficha = candidatas[0];
    fichas.push(ficha);
    console.log(`    ✓ ${tipo}: ${ficha.nombre} · ${ficha.id}`);
    console.log(`        es_test ${ficha.esTest ? "sí" : "NO ← con el modo test encendido no recibirá nada (§8)"}`);
    console.log(`        teléfono: ${estadoTelefono(ficha)}`);
    if (ficha.nombre.toLowerCase() !== persona.persona.toLowerCase()) {
      console.log(`        ! el nombre de la ficha no es «${persona.persona}»: compruébalo antes de repartir el acceso`);
    }
  }

  resueltas.push({ persona, fichas });
}

// ---------------------------------------------------------------------------
// 2. Cuentas de organización
// ---------------------------------------------------------------------------
// SIN ROL DE PLATAFORMA, y por eso este script NO ESCRIBE NUNCA en `usuario_roles`
// —ni inserta ni borra, a diferencia del fixture, que sí limpia esa tabla—. Toda la
// gracia de estas cuentas es ser externas: si alguna acabara con un rol de equipo
// vería las 452 fichas y dejaría de servir para lo que se creó. Tres de las cinco
// personas ya tienen su cuenta de equipo aparte, con OTRO correo, y esa no se toca.

console.log("\n2. Cuentas de organización (sin rol de plataforma)");

interface Credencial {
  email: string;
  password: string | null;
  paneles: string;
  aviso?: string;
}
const credenciales: Credencial[] = [];

for (const { persona, fichas } of resueltas) {
  const paneles = describePaneles(fichas);

  if (fichas.length === 0) {
    console.log(`  ⨯ ${persona.cuenta}: sin ninguna ficha enlazable → no se crea la cuenta`);
    console.log("      (una cuenta sin membresía solo vería la pantalla «encara no tens panell»)");
    continue;
  }

  if (dryRun) {
    console.log(`  [dry-run] ${persona.cuenta} · ${nombrePerfil(persona)} · ${paneles}`);
    for (const f of fichas) console.log(`      [dry-run] membresía ${f.tipo} · titular · ${f.nombre}`);
    credenciales.push({ email: persona.cuenta, password: null, paneles, aviso: persona.aviso });
    continue;
  }

  let userId = await buscaUsuari(persona.cuenta);
  let password: string | null = null;

  if (!userId) {
    password = generarPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: persona.cuenta,
      password,
      email_confirm: true, // no envía ningún correo (§9)
      user_metadata: { nombre: nombrePerfil(persona) },
    });
    if (error || !data.user) {
      console.error(`  ✗ ${persona.cuenta}: ${error?.message}`);
      continue;
    }
    userId = data.user.id;
    console.log(`  ✓ ${persona.cuenta} · cuenta nueva · ${paneles}`);
  } else {
    console.log(`  ✓ ${persona.cuenta} · ya existía (contraseña sin cambiar) · ${paneles}`);
  }

  // El trigger `on_auth_user_created` ya crea el perfil; el upsert es por si acaso y
  // para completar el nombre cuando la cuenta venía de antes.
  const { error: errPerfil } = await admin
    .from("perfiles")
    .upsert({ id: userId, email: persona.cuenta, nombre: nombrePerfil(persona) }, { onConflict: "id" });
  if (errPerfil) console.error(`    ! perfil: ${errPerfil.message}`);

  for (const ficha of fichas) await asseguraMembresia(userId, ficha);

  credenciales.push({ email: persona.cuenta, password, paneles, aviso: persona.aviso });
}

// ---------------------------------------------------------------------------
// 3. Credenciales
// ---------------------------------------------------------------------------

if (dryRun) {
  console.log("\n  Se crearían estas cuentas:\n");
  for (const c of credenciales) {
    console.log(`    ${c.email.padEnd(34)} ${c.paneles}${c.aviso ? `  ⚠️ ${c.aviso}` : ""}`);
  }
  console.log(`\nSimulación terminada. Quita --dry-run para aplicarlo.`);
  if (faltan > 0) console.log(`⚠️ Faltan ${faltan} ficha(s): míralo arriba antes de ejecutarlo en real.\n`);
  else console.log("");
  Deno.exit(faltan > 0 ? 1 : 0);
}

console.log("\n3. Credenciales (solo se muestran ahora)\n");
console.log("  ┌─────────────────────────────────────────────────────────────────────────┐");
for (const c of credenciales) {
  console.log(`    ${c.email}`);
  console.log(`      ${c.password ?? "(ya existía: contraseña sin cambiar)"}  ·  ${c.paneles}`);
  if (c.aviso) console.log(`      ⚠️ ${c.aviso}`);
}
console.log("  └─────────────────────────────────────────────────────────────────────────┘");

console.log(`
  Son cuentas EXTERNAS: sin rol de plataforma, cada una ve solo la ficha de su
  persona. Eso depende de que el modelo de roles esté encendido — compruébalo con
  \`deno run -A scripts/roles-activos.ts estat\` antes de repartirlas.

  Para probar WhatsApp hace falta, además de la cuenta: es_test en la ficha, el móvil
  en meta_test_recipients y la ventana de 24 h abierta (o una plantilla aprobada, §8).
  Laura Masdeu no cumple lo segundo: su cuenta sirve para recorrer el panel, no para
  el canal.

  Para mandar el acceso por enlace mágico en vez de dictar la contraseña, usa la Edge
  Function enviar-acceso con la sesión de una cuenta del equipo:

    curl -X POST "$SUPABASE_URL/functions/v1/enviar-acceso" \\
      -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \\
      -d '{"email":"${PERSONAS[0].cuenta}","canal":"email"}'
`);

if (faltan > 0) {
  console.error(`⚠️ ${faltan} ficha(s) esperada(s) no se pudieron enlazar (ver el punto 1).`);
  console.error("   No se ha creado ninguna: dalas de alta o corrige el correo y vuelve a ejecutarlo.\n");
}

Deno.exit(faltan > 0 ? 1 : 0);
