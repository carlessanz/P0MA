// Accesos directos a las cuentas de prueba, para el login de usuarios.
//
// ⚠️ ESTO SON CREDENCIALES EN CLARO EN EL CÓDIGO DEL CLIENTE. Se acepta a propósito y con
// dos límites que no se pueden relajar:
//
//   1. NINGUNA cuenta con rol de plataforma (`usuario_roles`). Esas ven las 452 fichas
//      reales, con nombre, NIF, teléfono y dirección de gente que existe; el acceso del
//      equipo es /admin, con contraseña y sin atajos.
//      La mayoría son además organizaciones FICTICIAS `TEST-*`, pero el grupo de WhatsApp
//      no puede serlo: los únicos móviles verificados en Meta están en fichas de personas
//      reales del equipo. Esas cuentas son externas y creadas aparte
//      (`scripts/crear-usuarios-whatsapp.ts`), así que cada una ve solo su propia ficha —
//      contacto profesional del equipo, no de los 345 productores externos.
//   2. Todo el bloque va detrás de `VITE_ACCESSOS_TEST`. Con la variable apagada, Vite
//      sustituye la constante por `false`, el `&&` de LoginUsuaris queda en código muerto
//      y este módulo se cae del bundle al hacer tree-shaking. Hay que comprobarlo con un
//      grep sobre `dist/` después de compilar; no basta con confiar.
//
// Las contraseñas son las que imprimió `scripts/crear-usuarios-prueba.ts` y están también
// en `docs/usuarios-test.md` (fuera de git).

export const accessosActius = import.meta.env.VITE_ACCESSOS_TEST === 'true'

export interface AccesTest {
  /** Qué prueba esta cuenta, para que se entienda el botón sin abrir la documentación. */
  nom: string
  organitzacio: string | null
  email: string
  password: string
}

export interface GrupAccessos {
  titolKey: string
  comptes: AccesTest[]
}

export const GRUPS_ACCESSOS: GrupAccessos[] = [
  {
    // Primero porque es el grupo con el que de verdad se prueba el producto entero: son
    // las únicas fichas con móvil verificado en Meta, y cuatro de las cinco tienen ficha
    // de productor Y de entidad. No son las cuentas de equipo de esas personas —esas
    // siguen entrando por /admin—, sino cuentas externas creadas aparte
    // (`scripts/crear-usuarios-whatsapp.ts`), así que cada una ve solo su propia ficha.
    //
    // El título no dice ni «doble rol» ni «WhatsApp» a secas porque ninguna de las dos
    // cosas es cierta para las cinco: Anna Garreta solo tiene ficha de entidad, y Laura
    // Masdeu no tiene teléfono. Lo que sí comparten es ser fichas reales del equipo; la
    // excepción de cada una va en su propia etiqueta.
    titolKey: 'test.grp_wa',
    comptes: [
      { nom: 'Productor + receptor · WhatsApp', organitzacio: 'Carles Sanz', email: 'hola+wa-carles@carlessanz.com', password: 'I4261-jWy0M-yefs7' },
      { nom: 'Productor + receptor · WhatsApp', organitzacio: 'Sebas Sale', email: 'hola+wa-sebas@carlessanz.com', password: '4MQGu-aUxNb-6rV5s' },
      { nom: 'Productor + receptor · WhatsApp', organitzacio: 'Raquel Diaz', email: 'hola+wa-raquel@carlessanz.com', password: 'uavod-gDiVJ-VqKT5' },
      { nom: 'Només receptor · WhatsApp', organitzacio: 'Anna Garreta', email: 'hola+wa-anna@carlessanz.com', password: 'EYFOH-HT0qK-neQbS' },
      { nom: 'Productor + receptor · SENSE WhatsApp', organitzacio: 'Laura Masdeu', email: 'hola+wa-laura@carlessanz.com', password: 'zTfJ0-Yo9aG-doIjq' },
    ],
  },
  {
    titolKey: 'test.grp_prod',
    comptes: [
      { nom: 'Titular', organitzacio: 'Mas de Prova SCP', email: 'hola+prodowner-masprova@carlessanz.com', password: 'PyaCL-ia5jD-E6Ba9' },
      { nom: 'Operador', organitzacio: 'Mas de Prova SCP', email: 'hola+produser-masprova@carlessanz.com', password: 'kJUET-iyNyy-uLkWp' },
      { nom: 'Titular', organitzacio: 'Horta de Prova SL', email: 'hola+prodowner-hortaprova@carlessanz.com', password: 'VUQPK-k4sLa-hSZWE' },
    ],
  },
  {
    titolKey: 'test.grp_rec',
    comptes: [
      { nom: 'Titular · social', organitzacio: 'Menjador Social de Prova', email: 'hola+recowner-social@carlessanz.com', password: 'UDBib-ABb7Y-eaqMg' },
      { nom: 'Operador · social', organitzacio: 'Menjador Social de Prova', email: 'hola+recuser-social@carlessanz.com', password: 'tDHRz-YnaCc-PzLV2' },
      { nom: 'Titular · animal', organitzacio: 'Granja de Prova', email: 'hola+recowner-animal@carlessanz.com', password: 'ckDxL-FobSz-Q7xQd' },
      { nom: 'Titular · transformador', organitzacio: 'Obrador de Prova', email: 'hola+recowner-obrador@carlessanz.com', password: 'HKfYQ-Vq4MH-W6Aqz' },
      { nom: 'Titular · comercial', organitzacio: 'Comercial de Prova SL', email: 'hola+recowner-comercial@carlessanz.com', password: 'FmJMZ-QJzC4-r7aYg' },
      { nom: 'Operador · comercial', organitzacio: 'Comercial de Prova SL', email: 'hola+recuser-comercial@carlessanz.com', password: '7UuCp-Fce3V-3dvCB' },
    ],
  },
  {
    titolKey: 'test.grp_ctrl',
    comptes: [
      { nom: 'Sense cap organització', organitzacio: null, email: 'hola+senserol@carlessanz.com', password: 'WBLAi-iD5CQ-QzMBo' },
      { nom: 'Registre pendent de validar', organitzacio: 'Mas Pendent de Prova SCP', email: 'hola+pendent-registre@carlessanz.com', password: '2BLZ6-UYuqg-ayJ8g' },
    ],
  },
]
