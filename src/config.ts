// Configuracion: los valores que cambian segun donde corra la app.
//
// Decision C11: la ruta de los datos es CONFIGURABLE. El codigo no cambia
// cuando el dato cambia de lugar. Hoy apunta a `datos\` dentro del repo; el dia
// que la app este lista, se apunta a `C:\Users\gonza\DeepS\rendimiento\tareas\`
// con una variable de entorno o cambiando el valor de aca abajo.

import { join } from "node:path";

/**
 * import.meta.dirname es la carpeta de ESTE archivo (src/), no la carpeta desde
 * la que se lanzo el comando. Con una ruta relativa, la app andaria o no segun
 * donde estes parado cuando la arrancas.
 */
export const RAIZ_PROYECTO = join(import.meta.dirname, "..");

/**
 * Donde viven los datos.
 *
 * Se puede pisar sin tocar el codigo:
 *   $env:TAREAS_DATOS="C:\Users\gonza\DeepS\rendimiento\tareas"; npm.cmd start
 */
export const DIRECTORIO_DATOS = process.env.TAREAS_DATOS ?? join(RAIZ_PROYECTO, "datos");

/** El archivo de tareas (Etapa 2 de C7: despues esto pasa a SQLite). */
export const ARCHIVO_TAREAS = join(DIRECTORIO_DATOS, "tareas.json");

/** Los pomodoros van en su propio archivo: tienen otro ciclo de vida (C22). */
export const ARCHIVO_POMODOROS = join(DIRECTORIO_DATOS, "pomodoros.json");

/**
 * La vista derivada que leen los presets `gabinete` y `rendimiento` (C6).
 * Es de SOLO LECTURA para ellos: la fuente de verdad son los datos.
 */
export const ARCHIVO_TABLERO = join(DIRECTORIO_DATOS, "tablero.md");

/** Puerto del servidor. Se puede pisar con $env:PORT. */
export const PUERTO = Number(process.env.PORT ?? 3000);

/** La app solo atiende a este equipo, nunca a la red local (C1). */
export const DIRECCION = "127.0.0.1";

/**
 * Zona horaria para calcular "hoy".
 *
 * La convencion del cuartel general (H5) es que la fecha es LA DEL CALENDARIO,
 * no la del reloj interno: un registro escrito a las 2 de la manana del 30
 * lleva 30, no 29. Por eso la fecha se calcula con la zona explicita y no con
 * `new Date().toISOString()`, que devuelve UTC y a esa hora da el dia anterior.
 */
export const ZONA = "America/Argentina/Buenos_Aires";

/**
 * La fecha de un instante como AAAA-MM-DD, en la zona de Buenos Aires.
 *
 * `en-CA` se usa solo porque formatea como 2026-10-13, que es exactamente el
 * formato que pide la convencion. No tiene nada que ver con Canada.
 *
 * Existe ademas de `hoy()` por un motivo concreto de los pomodoros: se guardan
 * como instantes en UTC, y para saber a que DIA pertenecen hay que pasarlos por
 * la zona. Un pomodoro de las 23:50 del 14 en Buenos Aires es, en UTC, la 01:50
 * del 15. Agrupar por dia sin convertir mete el ultimo pomodoro de la noche en
 * el dia equivocado, y el resumen diario quedaria mal justo en el horario en
 * que mas se trabaja.
 */
export function fechaEnZona(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(instante);
}

/** La fecha de hoy en formato AAAA-MM-DD, en la zona de Buenos Aires. */
export function hoy(ahora: Date = new Date()): string {
  return fechaEnZona(ahora);
}

/** La hora local HH:MM de un instante. Para mostrar, no para comparar. */
export function horaEnZona(instante: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);
}