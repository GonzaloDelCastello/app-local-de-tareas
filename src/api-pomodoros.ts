// El contrato de los POMODOROS (C12 y C22). Lo que comparten con las tareas
// -la forma de la respuesta, los errores y los validadores- esta en api-comun.ts.

import type { Almacen } from "./almacen.ts";
import {
  comoObjeto,
  enteroOpcional,
  metodoNoPermitido,
  noEncontrado,
  noValido,
  texto,
} from "./api-comun.ts";
import type { RespuestaApi } from "./api-comun.ts";
import { SolicitudInvalida } from "./api-comun.ts";
import { Pomodoro } from "./pomodoro.ts";
import type { EstadoPomodoro, PomodoroJSON } from "./pomodoro.ts";
import type { Tarea } from "./tarea.ts";

const RUTA_POMODOROS = /^\/api\/pomodoros(?:\/([^/]+))?$/;

const METODOS_EN_POMODOROS = "GET, POST";
const METODOS_EN_UN_POMODORO = "GET, PATCH";

/**
 * Un pomodoro con lo que se deriva del reloj, listo para el cliente.
 *
 * El estado, los segundos que faltan y lo que duro se calculan aca y viajan en
 * la respuesta. Si los calculara la interfaz por su cuenta, la regla de "cuando
 * esta cumplido" estaria escrita en dos lugares y podria divergir.
 *
 * Lo unico que la interfaz resta por su lado es `finPrevisto - ahora`, para
 * mover el reloj cada segundo sin pedirle nada al servidor. Restar dos
 * instantes no es una regla: es aritmetica.
 */
export interface PomodoroVista extends PomodoroJSON {
  finPrevisto: string;
  estado: EstadoPomodoro;
  segundosRestantes: number;
  duracionRealMin: number;
}

function verPomodoro(pomodoro: Pomodoro, ahora: Date): PomodoroVista {
  return {
    ...pomodoro.aJSON(),
    finPrevisto: pomodoro.finPrevisto().toISOString(),
    estado: pomodoro.estado(ahora),
    segundosRestantes: pomodoro.segundosRestantes(ahora),
    duracionRealMin: pomodoro.duracionRealMin(ahora),
  };
}

/**
 * El que esta corriendo AHORA, o null.
 *
 * Se busca entre los que nadie cerro **y** cuyo fin previsto todavia no paso.
 * Un pomodoro que quedo abierto de hace tres horas no esta corriendo: se
 * cumplio y nadie lo cerro. Si se devolviera igual, la interfaz mostraria un
 * reloj en negativo contando hacia arriba.
 */
async function pomodoroEnCurso(almacen: Almacen<Pomodoro>, ahora: Date): Promise<Pomodoro | null> {
  const abiertos = (await almacen.listar()).filter((p) => p.terminadoEl === null);
  const corriendo = abiertos.filter((p) => p.estado(ahora) === "en-curso");
  if (corriendo.length === 0) return null;
  // Si hubiera mas de uno, el mas reciente. No deberia pasar: POST lo impide.
  corriendo.sort((a, b) => Date.parse(b.iniciadoEl) - Date.parse(a.iniciadoEl));
  return corriendo[0] ?? null;
}

async function listarPomodoros(almacen: Almacen<Pomodoro>, ahora: Date): Promise<RespuestaApi> {
  const pomodoros = await almacen.listar();
  const vistas = pomodoros
    .map((p) => verPomodoro(p, ahora))
    .sort((a, b) => Date.parse(b.iniciadoEl) - Date.parse(a.iniciadoEl));
  return { codigo: 200, cuerpo: { pomodoros: vistas, total: vistas.length } };
}

async function crearPomodoro(
  cuerpoCrudo: string,
  almacen: Almacen<Pomodoro>,
  buscarTarea: (id: string) => Promise<Tarea | null>,
  ahora: Date,
): Promise<RespuestaApi> {
  const crudo = comoObjeto(cuerpoCrudo);
  const problemas: string[] = [];

  const tareaId = texto(crudo, "tareaId", problemas);
  const nota = texto(crudo, "nota", problemas);
  const duracion = enteroOpcional(crudo, "duracionMin", problemas);

  for (const campo of ["id", "iniciadoEl", "terminadoEl"]) {
    if (campo in crudo) problemas.push(`"${campo}" no se puede fijar desde afuera: lo decide el servidor`);
  }
  if (duracion === null) problemas.push('"duracionMin" no puede ser null: un pomodoro dura algo');
  if (problemas.length > 0) throw new SolicitudInvalida(problemas);

  // La tarea tiene que existir. Un pomodoro apuntando a una tarea que no esta
  // es un dato roto que despues nadie puede arreglar.
  if (tareaId !== undefined) {
    const tarea = await buscarTarea(tareaId);
    if (tarea === null) throw new SolicitudInvalida([`no existe la tarea ${tareaId}`]);
  }

  // Regla dura: un solo pomodoro a la vez. Dos relojes corriendo no significan
  // nada, y el registro quedaria con dos bloques abiertos superpuestos.
  const yaCorriendo = await pomodoroEnCurso(almacen, ahora);
  if (yaCorriendo !== null) {
    return {
      codigo: 409,
      cuerpo: {
        error: `Ya hay un pomodoro en curso (${yaCorriendo.id})`,
        pomodoro: verPomodoro(yaCorriendo, ahora),
      },
    };
  }

  const id = await almacen.siguienteId();
  const pomodoro = Pomodoro.nuevo(
    // `?? undefined` porque el tipo no admite null: si vino null ya se rechazo
    // mas arriba con un 400. Es el mismo caso que `estado: null` en las tareas,
    // y lo volvio a marcar el sistema de tipos.
    { tareaId: tareaId ?? null, duracionMin: duracion ?? undefined, nota },
    id,
    ahora,
  );
  await almacen.guardar(pomodoro);

  return {
    codigo: 201,
    cuerpo: verPomodoro(pomodoro, ahora),
    encabezados: { Location: `/api/pomodoros/${pomodoro.id}` },
    cambio: true,
  };
}

async function verUnPomodoro(id: string, almacen: Almacen<Pomodoro>, ahora: Date): Promise<RespuestaApi> {
  // "en-curso" es una ruta, no un id. Se resuelve antes de buscar.
  if (id === "en-curso") {
    const corriendo = await pomodoroEnCurso(almacen, ahora);
    return { codigo: 200, cuerpo: { pomodoro: corriendo === null ? null : verPomodoro(corriendo, ahora) } };
  }

  const pomodoro = await almacen.buscar(id);
  if (pomodoro === null) return noEncontrado(`No existe el pomodoro ${id}`);
  return { codigo: 200, cuerpo: verPomodoro(pomodoro, ahora) };
}

async function cerrarPomodoro(
  id: string,
  cuerpoCrudo: string,
  almacen: Almacen<Pomodoro>,
  ahora: Date,
): Promise<RespuestaApi> {
  const pomodoro = await almacen.buscar(id);
  if (pomodoro === null) return noEncontrado(`No existe el pomodoro ${id}`);

  const crudo = comoObjeto(cuerpoCrudo);
  const problemas: string[] = [];
  const estado = texto(crudo, "estado", problemas);
  const nota = texto(crudo, "nota", problemas);
  if (problemas.length > 0) throw new SolicitudInvalida(problemas);

  if (estado !== undefined && estado !== "terminado") {
    throw new SolicitudInvalida(['"estado" solo puede ser "terminado": un pomodoro no se reabre']);
  }

  if (nota !== undefined) pomodoro.nota = nota;
  if (estado === "terminado") pomodoro.cerrar(ahora);

  await almacen.guardar(pomodoro);
  return { codigo: 200, cuerpo: verPomodoro(pomodoro, ahora), cambio: true };
}

/**
 * Atiende las rutas de pomodoros.
 *
 * `buscarTarea` entra como funcion y no como el almacen entero: lo unico que
 * esta capa necesita de las tareas es poder preguntar si una existe. Pedir la
 * capacidad justa y no el objeto completo hace que sea mas facil de probar y
 * que no pueda tocar nada que no le corresponde.
 */
export async function manejarApiPomodoros(
  metodo: string,
  ruta: string,
  cuerpoCrudo: string,
  almacen: Almacen<Pomodoro>,
  buscarTarea: (id: string) => Promise<Tarea | null>,
  ahora: Date,
): Promise<RespuestaApi | null> {
  const coincidencia = RUTA_POMODOROS.exec(ruta);
  if (coincidencia === null) return null;

  const capturado = coincidencia[1];
  const id = capturado === undefined ? null : decodeURIComponent(capturado);

  try {
    if (id === null) {
      if (metodo === "GET") return await listarPomodoros(almacen, ahora);
      if (metodo === "POST") return await crearPomodoro(cuerpoCrudo, almacen, buscarTarea, ahora);
      return metodoNoPermitido(METODOS_EN_POMODOROS);
    }

    if (metodo === "GET") return await verUnPomodoro(id, almacen, ahora);
    if (metodo === "PATCH") return await cerrarPomodoro(id, cuerpoCrudo, almacen, ahora);
    return metodoNoPermitido(METODOS_EN_UN_POMODORO);
  } catch (falla) {
    if (falla instanceof SolicitudInvalida) return noValido(falla.problemas);
    throw falla;
  }
}