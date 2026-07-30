// El interruptor del modelo de roles (AGENTS.md §4bis).
//
//   SUPABASE_URL=... SB_SECRET_KEY=... deno run -A scripts/roles-activos.ts on|off|estat
//
//   on    → cada cuenta ve solo lo suyo (equipo, productor, receptor)
//   off   → comportamiento anterior: cualquier autenticado lo ve y lo puede todo
//   estat → solo consulta, no escribe
//
// Es la palanca de emergencia: si tras encenderlo el equipo se queda sin datos, un
// `off` lo devuelve todo en segundos, sin desplegar nada y sin cerrar sesiones. Por eso
// existe como script además de como sentencia SQL: para poder ejecutarlo sin tener que
// abrir el SQL Editor ni recordar la sintaxis.

import { createClient } from "npm:@supabase/supabase-js@2";

const accion = (Deno.args[0] ?? "estat").toLowerCase();
if (!["on", "off", "estat"].includes(accion)) {
  console.error("Uso: deno run -A scripts/roles-activos.ts on|off|estat");
  Deno.exit(1);
}

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SB_SECRET_KEY");
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SB_SECRET_KEY en el entorno.");
  Deno.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: actual } = await admin
  .from("app_settings").select("value").eq("key", "roles_activos").maybeSingle();
const estabaActivo = actual?.value === "true";

if (accion === "estat") {
  console.log(`\nroles_activos = ${actual?.value ?? "(sense fila)"}  →  ${
    estabaActivo ? "cada compte veu només el seu" : "tothom ho veu tot (comportament anterior)"
  }\n`);
  Deno.exit(0);
}

const nuevo = accion === "on";
if (nuevo === estabaActivo) {
  console.log(`\nYa estaba ${nuevo ? "encendido" : "apagado"}. No se ha tocado nada.\n`);
  Deno.exit(0);
}

const { error } = await admin.from("app_settings").upsert(
  { key: "roles_activos", value: nuevo ? "true" : "false", updated_at: new Date().toISOString() },
  { onConflict: "key" },
);
if (error) {
  console.error("No se pudo escribir:", error.message);
  Deno.exit(1);
}

console.log(`\nroles_activos: ${estabaActivo} → ${nuevo}`);
if (nuevo) {
  console.log(`
  A partir de ahora cada cuenta ve solo lo suyo. Comprueba el panel del equipo antes
  de dar acceso a nadie más. Para deshacerlo, al instante y sin desplegar:

    deno run -A scripts/roles-activos.ts off
`);
} else {
  console.log("\n  Vuelta al comportamiento anterior: cualquier autenticado lo ve todo.\n");
}
