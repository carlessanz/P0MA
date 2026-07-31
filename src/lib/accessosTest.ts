// Accesos directos a las cuentas de prueba, para el login de usuarios.
//
// ⚠️ ESTO SON CREDENCIALES EN CLARO EN EL CÓDIGO DEL CLIENTE. Se acepta a propósito y con
// dos límites que no se pueden relajar:
//
//   1. Solo cuentas de las organizaciones FICTICIAS `TEST-*`. Ninguna cuenta con rol de
//      equipo (`usuario_roles`) puede aparecer aquí: esas ven las 452 fichas reales, con
//      nombre, NIF, teléfono y dirección de gente que existe. El acceso del equipo es
//      /admin, con contraseña y sin atajos.
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
