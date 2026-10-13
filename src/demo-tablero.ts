// Muestra el tablero que la app publica para los agentes, sin arrancar el
// servidor. Se corre con:  node src/demo-tablero.ts
//
// Las tareas son las de tu bandeja real del 2026-10-02 al 2026-10-09, para ver
// como quedan una vez que dejan de ser lineas de texto y pasan a ser datos.

import { Tarea, proyectarTablero } from "./tarea.ts";
import { hoy } from "./config.ts";

const HOY = hoy();

const tareas = [
  Tarea.crear(
    { titulo: "Contactar a quien revisa el techo", balde: "A", dependenciasExternas: true, estimacionMin: 30, origen: "bandeja:2026-10-02" },
    "t-0001", HOY,
  ),
  Tarea.crear(
    { titulo: "Pagar tarjeta VISA", venceEl: "2026-10-14", impostergable: true, balde: "A", origen: "bandeja:2026-10-08" },
    "t-0002", HOY,
  ),
  Tarea.crear(
    { titulo: "Proyecto de sueldos docentes", balde: "B", dimension: "desarrollo", estimacionMin: 120, etiquetas: ["proyecto"], origen: "bandeja:2026-10-02" },
    "t-0003", HOY,
  ),
  Tarea.crear(
    { titulo: "Terminar el parque", balde: "B", estimacionMin: 600, origen: "bandeja:2026-10-08" },
    "t-0004", HOY,
  ),
  Tarea.crear(
    { titulo: "Hacer el registro de bitacora en Nacional", balde: "C", dimension: "docente", origen: "bandeja:2026-10-08" },
    "t-0005", HOY,
  ),
];

tareas[1].moverA("en-curso", 0, HOY);
tareas[2].moverA("en-curso", 1, HOY);
tareas[4].moverA("hecha", 0, HOY);

console.log(proyectarTablero(tareas, HOY));