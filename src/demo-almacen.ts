// El ciclo completo, contra el disco de verdad:
//
//   datos\tareas.json  ->  Tarea[]  ->  datos\tablero.md
//
// Se corre con:  node src/demo-almacen.ts
//
// Usa la ruta que fija config.ts (C11). Si el archivo no existe, lo crea con
// las tareas de tu bandeja del 2026-10-02 al 2026-10-09, para ver como quedan
// una vez que dejan de ser lineas de texto.

import { crearAlmacenJSON, publicarTablero } from "./almacen.ts";
import { ARCHIVO_TABLERO, ARCHIVO_TAREAS, DIRECTORIO_DATOS, hoy } from "./config.ts";
import { Tarea } from "./tarea.ts";
import type { DatosNuevaTarea } from "./tipos.ts";

const HOY = hoy();

const semilla: DatosNuevaTarea[] = [
  {
    titulo: "Contactar a quien revisa el techo",
    balde: "A", dependenciasExternas: true, estimacionMin: 30, origen: "bandeja:2026-10-02",
  },
  {
    titulo: "Pagar tarjeta VISA",
    venceEl: "2026-10-14", impostergable: true, balde: "A", origen: "bandeja:2026-10-08",
  },
  {
    titulo: "Proyecto de sueldos docentes",
    balde: "B", dimension: "desarrollo", estimacionMin: 120, etiquetas: ["proyecto"], origen: "bandeja:2026-10-02",
  },
  {
    titulo: "Terminar el parque",
    balde: "B", estimacionMin: 600, origen: "bandeja:2026-10-08",
  },
  {
    titulo: "Hacer el registro de bitacora en Nacional",
    balde: "C", dimension: "docente", origen: "bandeja:2026-10-08",
  },
];

const almacen = crearAlmacenJSON(ARCHIVO_TAREAS);
const existentes = await almacen.listar();

if (existentes.length === 0) {
  console.log(`El almacen estaba vacio: cargo ${semilla.length} tareas de ejemplo.`);
  let cuantas = 0;
  for (const datos of semilla) {
    // El id lo pide el almacen, no lo inventa quien llama: es el unico que sabe
    // cual es el ultimo que hay.
    const id = await almacen.siguienteId();
    const tarea = Tarea.crear(datos, id, HOY);

    // Algunas se mueven, para que el tablero muestre columnas distintas.
    if (tarea.titulo.startsWith("Pagar")) tarea.moverA("en-curso", 0, HOY);
    if (tarea.titulo.startsWith("Proyecto")) tarea.moverA("en-curso", 1, HOY);
    if (tarea.titulo.startsWith("Hacer el registro")) tarea.moverA("hecha", 0, HOY);

    await almacen.guardar(tarea);
    cuantas = cuantas + 1;
  }
  console.log(`Guardadas ${cuantas}.`);
} else {
  console.log(`El almacen ya tenia ${existentes.length} tareas: no toco nada.`);
}

const tablero = await publicarTablero(almacen, ARCHIVO_TABLERO, HOY);

console.log("");
console.log(`Datos     : ${ARCHIVO_TAREAS}`);
console.log(`Tablero   : ${ARCHIVO_TABLERO}`);
console.log(`Directorio: ${DIRECTORIO_DATOS}`);
console.log("");
console.log(`Proximo id: ${await almacen.siguienteId()}`);
console.log(`Tareas    : ${(await almacen.listar()).length}`);
console.log("");
console.log("--- tablero.md ---");
console.log(tablero);