// Los campos de una oferta, en un solo sitio.
//
// El intake por WhatsApp (`intake.ts`) y el formulario del panel del productor
// preguntan exactamente lo mismo, así que la lista de pasos vive aquí y la usan los
// dos. El panel no la lleva escrita en TypeScript: la PIDE con
// `GET /functions/v1/crear-oferta/campos`. Es la única forma de que «el mismo
// formulario» siga siendo cierto dentro de seis meses.
//
// Las opciones salen siempre de las tablas (§6bis), nunca escritas a mano, salvo los
// vocabularios cerrados que ya estaban en el código (tipo de caja, retorno, modalitat).

/** Orden canónico de los pasos. `familia` solo sirve para acotar `producte`. */
export const PASOS = [
  "familia",
  "producte",
  "varietat",
  "kg",
  "caixes",
  "tipus_caixa",
  "retorn",
  "ubicacio",
  "disponible_fins",
  "horari",
  "modalitat",
  "preu_minim",
  "causa",
  "observacions",
] as const;

export type Paso = typeof PASOS[number];

export const TIPOS_CAIXA = [
  "Rígida FE",
  "Plegable FE",
  "Palot",
  "Retornable",
  "Productor/a",
  "No retorn",
];

export const OPCIONES_RETORN = ["Sí", "No", "Caixes pròpies"];

export const MODALITATS = [
  { id: "donacio", titulo: "Donació" },
  { id: "venda", titulo: "Venda" },
  { id: "maquila", titulo: "Maquila" },
];

export type TipoCampo = "familia" | "producte" | "text" | "numero" | "opcions" | "ubicacio" | "causa";

export interface CampoOferta {
  clave: Paso;
  tipo: TipoCampo;
  /** Etiqueta en català, la misma que se pregunta por WhatsApp. */
  etiqueta: string;
  ayuda?: string;
  obligatorio: boolean;
  opciones?: { id: string; titulo: string }[];
  /** Se pregunta solo si otro campo tiene uno de estos valores. */
  condicion?: { campo: Paso; en: string[] };
}

/** Descriptor de los 14 pasos, con las mismas preguntas que hace el bot. */
export const CAMPOS: CampoOferta[] = [
  { clave: "familia", tipo: "familia", etiqueta: "De quina família és el producte?", obligatorio: true },
  { clave: "producte", tipo: "producte", etiqueta: "Quin producte?", obligatorio: true },
  { clave: "varietat", tipo: "text", etiqueta: "Quina varietat és?", ayuda: "Deixa-ho buit si no aplica", obligatorio: false },
  { clave: "kg", tipo: "numero", etiqueta: "Quants kg aproximadament?", obligatorio: true },
  { clave: "caixes", tipo: "numero", etiqueta: "Quantes caixes són?", ayuda: "Deixa-ho buit si no ho saps", obligatorio: false },
  { clave: "tipus_caixa", tipo: "opcions", etiqueta: "Quin tipus de caixa?", obligatorio: false, opciones: TIPOS_CAIXA.map((t) => ({ id: t, titulo: t })) },
  { clave: "retorn", tipo: "opcions", etiqueta: "Cal retornar els envasos?", obligatorio: false, opciones: OPCIONES_RETORN.map((t) => ({ id: t, titulo: t })) },
  { clave: "ubicacio", tipo: "ubicacio", etiqueta: "On es recull?", obligatorio: false },
  { clave: "disponible_fins", tipo: "text", etiqueta: "Fins quin dia està disponible?", ayuda: "Per exemple 23/07", obligatorio: true },
  { clave: "horari", tipo: "text", etiqueta: "Quin horari de recollida va bé?", ayuda: "matí, tarda, hores…", obligatorio: false },
  { clave: "modalitat", tipo: "opcions", etiqueta: "Quina modalitat és?", obligatorio: true, opciones: MODALITATS },
  {
    clave: "preu_minim",
    tipo: "numero",
    etiqueta: "A quin preu mínim (€/kg) la vols oferir?",
    obligatorio: true,
    condicion: { campo: "modalitat", en: ["venda", "maquila"] },
  },
  { clave: "causa", tipo: "causa", etiqueta: "Quina és la causa de l'excedent?", obligatorio: true },
  { clave: "observacions", tipo: "text", etiqueta: "Alguna observació?", obligatorio: false },
];

/** ¿Este campo se pregunta, dados los datos ya introducidos? */
export function aplica(campo: CampoOferta, datos: Record<string, unknown>): boolean {
  if (!campo.condicion) return true;
  return campo.condicion.en.includes(String(datos[campo.condicion.campo] ?? ""));
}

/** Campos obligatorios que faltan. Lista vacía = se puede crear la oferta. */
export function faltantes(datos: Record<string, unknown>): Paso[] {
  return CAMPOS
    .filter((c) => c.obligatorio && aplica(c, datos))
    .filter((c) => {
      const v = datos[c.clave];
      return v === undefined || v === null || String(v).trim() === "";
    })
    .map((c) => c.clave);
}
