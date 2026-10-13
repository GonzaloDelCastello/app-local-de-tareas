// Tipos compartidos del proyecto.
//
// Aca no hay logica y no hay comportamiento: solo la FORMA de los datos.
// La regla del archivo: si algo se guarda en el JSON, su forma se declara aca.

/**
 * Las columnas del tablero.
 *
 * Es una union de literales y NO un `enum`. Dos motivos:
 *   1. Node ejecuta TypeScript BORRANDO los tipos; un `enum` genera codigo de
 *      verdad y el runtime lo rechaza con un error.
 *   2. La union es la forma idiomatica en TypeScript moderno.
 */
export type Estado = "pendiente" | "en-curso" | "hecha" | "descartada";

/**
 * Los baldes que ya usa `rendimiento\bandeja.md`. El criterio no es cuan
 * importante es la tarea, sino QUE RECURSO consume:
 *   A = depende de otra persona, y esa persona trabaja en horario comercial
 *   B = trabajo de proyecto: necesita un bloque de concentracion
 *   C = no es de `rendimiento`, le toca a otro agente
 */
export type Balde = "A" | "B" | "C";

/** A que agente del cuartel general le toca esta tarea. */
export type Dimension =
  | "rendimiento"
  | "docente"
  | "desarrollo"
  | "salud"
  | "it-remoto"
  | "finanzas"
  | "gabinete";

/**
 * La forma de una tarea GUARDADA: exactamente lo que va al JSON.
 *
 * Es un tipo y no una clase a proposito. `JSON.parse` no devuelve instancias:
 * devuelve objetos planos. Si guardaramos la clase, al leer tendriamos objetos
 * sin metodos y habria que reconstruirlos. Se separa entonces:
 *
 *   TareaJSON  -> la forma de los datos      (tipos.ts)
 *   Tarea      -> el objeto con metodos      (tarea.ts)
 *
 * Decisiones de forma:
 *   - Los campos que pueden faltar son `| null` y no opcionales (`?`): en JSON
 *     un campo ausente y un campo `null` no son lo mismo, y asi el archivo
 *     siempre tiene la misma forma y se lee de un vistazo.
 *   - Las fechas son `string` "AAAA-MM-DD", la del calendario. Nunca `Date`:
 *     en JSON un `Date` no existe, y al serializarlo se vuelve texto en UTC,
 *     que es otra fecha si escribis de madrugada.
 */
export interface TareaJSON {
  // --- Identidad ---
  /** Estable y legible, tipo "t-0007". Es lo que hoy NO existe (hallazgo H2). */
  id: string;

  // --- Contenido ---
  /** Obligatorio y no vacio. Hoy el titulo es TODA la identidad de una tarea. */
  titulo: string;
  /** Texto largo. Cadena vacia si no hay. */
  detalle: string;

  // --- Estado y posicion ---
  estado: Estado;
  /** Posicion dentro de la columna. Sin esto, arrastrar y soltar no se guarda. */
  orden: number;

  // --- Fechas (AAAA-MM-DD) ---
  creadaEl: string;
  actualizadaEl: string;
  /** Se completa solo al pasar a "hecha" o "descartada". */
  cerradaEl: string | null;

  // --- Clasificacion (la que ya usas a mano en la bandeja) ---
  balde: Balde | null;
  /**
   * La pregunta 3 del set de captura: "depende de otra persona".
   * Es lo que separa el balde A del resto, asi que se guarda como DATO y no
   * como prosa suelta en una linea de texto.
   */
  dependenciasExternas: boolean;
  dimension: Dimension | null;
  etiquetas: string[];

  // --- Tiempo ---
  venceEl: string | null;
  /** El `**impostergable**` que ya escribis a mano. */
  impostergable: boolean;
  /** Estimacion en minutos. "10 hs" son 600. */
  estimacionMin: number | null;

  // --- Trazabilidad ---
  /** De donde salio: "bandeja:2026-10-08". Cadena vacia si la creaste vos. */
  origen: string;
}

/**
 * Lo que hace falta para crear una tarea: el resto lo pone `Tarea.crear()`.
 * Nace del set de captura de cuatro preguntas de `rendimiento\bandeja.md`.
 */
export interface DatosNuevaTarea {
  titulo: string;
  detalle?: string;
  balde?: Balde | null;
  dependenciasExternas?: boolean;
  dimension?: Dimension | null;
  etiquetas?: string[];
  venceEl?: string | null;
  impostergable?: boolean;
  estimacionMin?: number | null;
  origen?: string;
}

/**
 * Los valores validos, como VALORES y no como tipos.
 *
 * Esta es la leccion mas importante del archivo: los tipos NO EXISTEN cuando el
 * programa corre. Node los borra. Asi que un tipo no sirve para validar un dato
 * que llega de afuera (un JSON, un formulario, un agente que escribe un
 * archivo). Para eso hace falta una lista de valores que si exista en runtime.
 */
export const ESTADOS: readonly Estado[] = ["pendiente", "en-curso", "hecha", "descartada"];

export const BALDES: readonly Balde[] = ["A", "B", "C"];

export const DIMENSIONES: readonly Dimension[] = [
  "rendimiento",
  "docente",
  "desarrollo",
  "salud",
  "it-remoto",
  "finanzas",
  "gabinete",
];

/** Solo `hecha` y `descartada` cierran una tarea. */
export const ESTADOS_CERRADOS: readonly Estado[] = ["hecha", "descartada"];

/** Las columnas del tablero, en el orden en que se muestran. */
export const COLUMNAS: readonly Estado[] = ["pendiente", "en-curso", "hecha", "descartada"];