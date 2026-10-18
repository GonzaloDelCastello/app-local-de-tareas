// Publica lo que leen los agentes, sin tocar la app.
//
//   node src/exportar.ts
//
// Sirve cuando el archivo se borro, cuando se edito a mano, o simplemente para
// no esperar a que haya un cambio. Es idempotente: correrlo dos veces da lo
// mismo (salvo la hora de generacion).

import { crearAlmacenDePomodoros, crearAlmacenDeTareas, publicarTablero } from "./almacen.ts";
import { ARCHIVO_EXPORTE, ARCHIVO_POMODOROS, ARCHIVO_TABLERO, ARCHIVO_TAREAS } from "./config.ts";
import { publicarExporte } from "./exporte.ts";

const almacen = crearAlmacenDeTareas(ARCHIVO_TAREAS);
const almacenPomodoros = crearAlmacenDePomodoros(ARCHIVO_POMODOROS);
const ahora = new Date();

await publicarTablero(almacen, almacenPomodoros, ARCHIVO_TABLERO, ahora);
const exporte = await publicarExporte(almacen, almacenPomodoros, ARCHIVO_EXPORTE, ahora);

const conPomodoros = exporte.tareas.filter((t) => t.pomodoros.length > 0).length;

console.log("Publicado para los agentes:");
console.log(`  ${ARCHIVO_TABLERO}`);
console.log(`  ${ARCHIVO_EXPORTE}`);
console.log("");
console.log(`  tareas exportadas : ${exporte.tareas.length}`);
console.log(`  con pomodoros     : ${conPomodoros}`);
console.log(`  schema_version    : ${exporte.schema_version}`);