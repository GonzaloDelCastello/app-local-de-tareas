// El contrato de las TAREAS (Etapa 3). Los pomodoros viven en api-pomodoros.ts,
// y lo que comparten los dos, en api-comun.ts.
//
// POR QUE ESTA SEPARADO DE servidor.ts
//
// servidor.ts sabe de HTTP: leer el cuerpo, escribir encabezados, atajar el
// error de puerto ocupado. Este archivo sabe del DOMINIO por HTTP: que rutas
// existen, que metodos acepta cada una, que codigo de estado corresponde, y que
// se hace con los datos. Si estuvieran juntos, cambiar una regla del tablero
// obligaria a tocar el mismo archivo que maneja sockets.
//
// QUE ES "UN CONTRATO"
//
//   - Que rutas hay, y que metodo acepta cada una (y que pasa si te equivocas)
//   - Que codigo de estado devuelve cada caso
//   - Que forma tiene el cuerpo, en las dos direcciones
//   - Que errores existen, con que forma y con que mensaje
//
// El contrato es lo que permite que el navegador y los agentes cambien sin
// romperse. Si no esta escrito, cada consumidor adivina.

import type { Almacen } from "./almacen.ts";
import {
  booleano,
  comoObjeto,
  enLista,
  enListaSinNull,
  enteroOpcional,
  fechaOpcional,
  listaDeTextos,
  metodoNoPermitido,
  noEncontrado,
  noValido,
  texto,
} from "./api-comun.ts";
import type { RespuestaApi } from "./api-comun.ts";
import { SolicitudInvalida } from "./api-comun.ts";
import { Tarea } from "./tarea.ts";
import { BALDES, DIMENSIONES, ESTADOS } from "./tipos.ts";
import type { Balde, DatosNuevaTarea, Dimension, Estado } from "./tipos.ts";

/** `/api/tareas` y `/api/tareas/<id>`. Nada mas profundo: eso es 404. */
const RUTA_TAREAS = /^\/api\/tareas(?:\/([^/]+))?$/;

const METODOS_EN_TAREAS = "GET, POST";
const METODOS_EN_UNA_TAREA = "GET, PATCH, DELETE";

/**
 * Campos que el cliente NO puede fijar: son del servidor.
 *
 * `id` porque lo asigna el almacen (es el unico que sabe cual esta libre);
 * el resto porque son consecuencia de las operaciones, no datos de entrada.
 * Aceptarlos en silencio seria peor: el cliente creeria que los esta fijando.
 */
const CAMPOS_DEL_SERVIDOR = ["id", "creadaEl", "actualizadaEl", "cerradaEl"];

interface CamposLeidos {
  titulo?: string;
  detalle?: string;
  balde?: Balde | null;
  dependenciasExternas?: boolean;
  dimension?: Dimension | null;
  etiquetas?: string[];
  venceEl?: string | null;
  impostergable?: boolean;
  estimacionMin?: number | null;
  origen?: string;
  estado?: Estado;
  orden?: number;
}

/**
 * Lee los campos que SI puede mandar el cliente.
 *
 * `permitirEstadoEnOrden` es lo que separa el POST del PATCH: al crear, una
 * tarea siempre nace en "pendiente" y con orden 0. Dejarlo entrar en el POST
 * seria permitir crear una tarea ya cerrada, sin fecha de cierre coherente.
 */
function leerCampos(
  crudo: Record<string, unknown>,
  permitirEstadoEnOrden: boolean,
): CamposLeidos {
  const problemas: string[] = [];

  for (const campo of CAMPOS_DEL_SERVIDOR) {
    if (campo in crudo) {
      problemas.push(`"${campo}" no se puede fijar desde afuera: lo decide el servidor`);
    }
  }

  const campos: CamposLeidos = {};
  campos.titulo = texto(crudo, "titulo", problemas);
  campos.detalle = texto(crudo, "detalle", problemas);
  campos.origen = texto(crudo, "origen", problemas);
  campos.balde = enLista(crudo, "balde", BALDES, problemas);
  campos.dimension = enLista(crudo, "dimension", DIMENSIONES, problemas);
  campos.dependenciasExternas = booleano(crudo, "dependenciasExternas", problemas);
  campos.impostergable = booleano(crudo, "impostergable", problemas);
  campos.venceEl = fechaOpcional(crudo, "venceEl", problemas);
  campos.estimacionMin = enteroOpcional(crudo, "estimacionMin", problemas);
  campos.etiquetas = listaDeTextos(crudo, "etiquetas", problemas);

  if (permitirEstadoEnOrden) {
    campos.estado = enListaSinNull(crudo, "estado", ESTADOS, problemas);
    const orden = crudo["orden"];
    if (orden !== undefined) {
      if (typeof orden !== "number" || !Number.isInteger(orden) || orden < 0) {
        problemas.push('"orden" tiene que ser un entero mayor o igual a 0');
      } else {
        campos.orden = orden;
      }
    }
  } else {
    for (const campo of ["estado", "orden"]) {
      if (campo in crudo) {
        problemas.push(`"${campo}" no se puede fijar al crear: una tarea nace en "pendiente" y orden 0`);
      }
    }
  }

  if (problemas.length > 0) throw new SolicitudInvalida(problemas);
  return campos;
}

// ---------------------------------------------------------------------------
// Las operaciones
// ---------------------------------------------------------------------------

async function listar(almacen: Almacen<Tarea>): Promise<RespuestaApi> {
  const tareas = await almacen.listar();
  // Envoltorio y no una lista pelada: asi se puede agregar un dato mas (un
  // total, una version del contrato) sin romper a quien ya lo usa.
  return { codigo: 200, cuerpo: { tareas: tareas.map((t) => t.aJSON()), total: tareas.length } };
}

async function verUna(id: string, almacen: Almacen<Tarea>): Promise<RespuestaApi> {
  const tarea = await almacen.buscar(id);
  if (tarea === null) return noEncontrado(`No existe la tarea ${id}`);
  return { codigo: 200, cuerpo: tarea.aJSON() };
}

async function crear(
  cuerpoCrudo: string,
  almacen: Almacen<Tarea>,
  hoy: string,
): Promise<RespuestaApi> {
  const campos = leerCampos(comoObjeto(cuerpoCrudo), false);

  if (campos.titulo === undefined || campos.titulo.trim() === "") {
    throw new SolicitudInvalida(['"titulo" es obligatorio y no puede estar vacio']);
  }

  const datos: DatosNuevaTarea = {
    titulo: campos.titulo,
    detalle: campos.detalle,
    balde: campos.balde,
    dependenciasExternas: campos.dependenciasExternas,
    dimension: campos.dimension,
    etiquetas: campos.etiquetas,
    venceEl: campos.venceEl,
    impostergable: campos.impostergable,
    estimacionMin: campos.estimacionMin,
    origen: campos.origen,
  };

  // El id lo pide el almacen, no el cliente ni la API.
  const id = await almacen.siguienteId();

  let tarea: Tarea;
  try {
    tarea = Tarea.crear(datos, id, hoy);
  } catch (falla) {
    // Tarea.crear valida las invariantes del dominio. Que su error sea un 400 y
    // no un 500 es justamente porque el dato vino de afuera.
    throw new SolicitudInvalida([falla instanceof Error ? falla.message : String(falla)]);
  }

  await almacen.guardar(tarea);

  return {
    codigo: 201,
    cuerpo: tarea.aJSON(),
    encabezados: { Location: `/api/tareas/${tarea.id}` },
    cambio: true,
  };
}

async function modificar(
  id: string,
  cuerpoCrudo: string,
  almacen: Almacen<Tarea>,
  hoy: string,
): Promise<RespuestaApi> {
  const tarea = await almacen.buscar(id);
  if (tarea === null) return noEncontrado(`No existe la tarea ${id}`);

  const campos = leerCampos(comoObjeto(cuerpoCrudo), true);

  if (campos.titulo !== undefined) tarea.titulo = campos.titulo;
  if (campos.detalle !== undefined) tarea.detalle = campos.detalle;
  if (campos.origen !== undefined) tarea.origen = campos.origen;
  if (campos.balde !== undefined) tarea.balde = campos.balde;
  if (campos.dimension !== undefined) tarea.dimension = campos.dimension;
  if (campos.dependenciasExternas !== undefined) tarea.dependenciasExternas = campos.dependenciasExternas;
  if (campos.impostergable !== undefined) tarea.impostergable = campos.impostergable;
  if (campos.venceEl !== undefined) tarea.venceEl = campos.venceEl;
  if (campos.estimacionMin !== undefined) tarea.estimacionMin = campos.estimacionMin;
  if (campos.etiquetas !== undefined) tarea.etiquetas = campos.etiquetas;

  // El estado y el orden NO se asignan a mano: se pasan por moverA(), que es
  // quien mantiene las invariantes (fecha de cierre al cerrar, y al reabrir la
  // saca) y actualiza la fecha de modificacion.
  if (campos.estado !== undefined || campos.orden !== undefined) {
    try {
      tarea.moverA(campos.estado ?? tarea.estado, campos.orden ?? tarea.orden, hoy);
    } catch (falla) {
      throw new SolicitudInvalida([falla instanceof Error ? falla.message : String(falla)]);
    }
  } else {
    tarea.actualizadaEl = hoy;
  }

  const problemas = tarea.validar();
  if (problemas.length > 0) throw new SolicitudInvalida(problemas);

  await almacen.guardar(tarea);
  return { codigo: 200, cuerpo: tarea.aJSON(), cambio: true };
}

async function eliminar(id: string, almacen: Almacen<Tarea>): Promise<RespuestaApi> {
  const tarea = await almacen.buscar(id);
  // 404 y no 204: borrar algo que no existe no es lo mismo que borrarlo, y
  // quien llama merece enterarse. (Es discutible: DELETE es idempotente para
  // buena parte de la bibliografia. Se elige el aviso.)
  if (tarea === null) return noEncontrado(`No existe la tarea ${id}`);

  await almacen.eliminar(id);
  return { codigo: 204, cuerpo: null, cambio: true };
}

// ---------------------------------------------------------------------------
// El punto de entrada
// ---------------------------------------------------------------------------

/**
 * Atiende las rutas de tareas.
 *
 * Devuelve `null` si la ruta no es de este recurso: asi el servidor prueba con
 * el siguiente sin que esta capa sepa que existen los demas.
 */
export async function manejarApi(
  metodo: string,
  ruta: string,
  cuerpoCrudo: string,
  almacen: Almacen<Tarea>,
  hoy: string,
): Promise<RespuestaApi | null> {
  const coincidencia = RUTA_TAREAS.exec(ruta);
  if (coincidencia === null) return null;

  const capturado = coincidencia[1];
  const id = capturado === undefined ? null : decodeURIComponent(capturado);

  try {
    if (id === null) {
      if (metodo === "GET") return await listar(almacen);
      if (metodo === "POST") return await crear(cuerpoCrudo, almacen, hoy);
      return metodoNoPermitido(METODOS_EN_TAREAS);
    }

    if (metodo === "GET") return await verUna(id, almacen);
    if (metodo === "PATCH") return await modificar(id, cuerpoCrudo, almacen, hoy);
    if (metodo === "DELETE") return await eliminar(id, almacen);
    return metodoNoPermitido(METODOS_EN_UNA_TAREA);
  } catch (falla) {
    if (falla instanceof SolicitudInvalida) return noValido(falla.problemas);
    throw falla;
  }
}