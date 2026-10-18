// El contrato de la API (Etapa 3).
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
import { Pomodoro } from "./pomodoro.ts";
import type { EstadoPomodoro, PomodoroJSON } from "./pomodoro.ts";
import { Tarea } from "./tarea.ts";
import { BALDES, DIMENSIONES, ESTADOS } from "./tipos.ts";
import type { Balde, DatosNuevaTarea, Dimension, Estado } from "./tipos.ts";

/** Lo que la API devuelve. El servidor lo traduce a HTTP. */
export interface RespuestaApi {
  codigo: number;
  /** null en las respuestas sin cuerpo (204). */
  cuerpo: unknown;
  encabezados?: Record<string, string>;
  /**
   * true si la operacion cambio los datos. El servidor lo usa para regenerar la
   * vista derivada que leen los agentes: la API decide, el servidor hace el
   * efecto. Un GET nunca lo pone en true.
   */
  cambio?: boolean;
}

/** `/api/tareas` y `/api/tareas/<id>`. Nada mas profundo: eso es 404. */
const RUTA_TAREAS = /^\/api\/tareas(?:\/([^/]+))?$/;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

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

/** El error que se convierte en 400. */
class SolicitudInvalida extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(problemas.join("; "));
    this.problemas = problemas;
  }
}

function error(codigo: number, mensaje: string, detalles?: string[]): RespuestaApi {
  const cuerpo: Record<string, unknown> = { error: mensaje };
  if (detalles !== undefined && detalles.length > 0) cuerpo.detalles = detalles;
  return { codigo, cuerpo };
}

function metodoNoPermitido(permitidos: string): RespuestaApi {
  return {
    codigo: 405,
    cuerpo: { error: `Ese metodo no existe para esta ruta. Los validos son: ${permitidos}` },
    encabezados: { Allow: permitidos },
  };
}

// ---------------------------------------------------------------------------
// Lectura y validacion del cuerpo
//
// Esto es lo que los tipos NO pueden hacer. `TareaJSON` describe la forma de un
// dato que ya es correcto; no dice nada de lo que llega de afuera. Un cuerpo de
// peticion es `unknown` hasta que alguien lo revisa, y ese alguien es este.
// ---------------------------------------------------------------------------

function comoObjeto(cuerpoCrudo: string): Record<string, unknown> {
  if (cuerpoCrudo.trim() === "") {
    throw new SolicitudInvalida(["el cuerpo de la peticion esta vacio"]);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(cuerpoCrudo);
  } catch {
    throw new SolicitudInvalida(["el cuerpo no es JSON valido"]);
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    throw new SolicitudInvalida(["el cuerpo tiene que ser un objeto JSON"]);
  }
  return crudo as Record<string, unknown>;
}

function texto(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "string") {
    problemas.push(`"${campo}" tiene que ser texto`);
    return undefined;
  }
  return valor;
}

function booleano(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): boolean | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "boolean") {
    problemas.push(`"${campo}" tiene que ser true o false`);
    return undefined;
  }
  return valor;
}

function fechaOpcional(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string" || !FORMATO_FECHA.test(valor)) {
    problemas.push(`"${campo}" tiene que ser null o una fecha AAAA-MM-DD`);
    return undefined;
  }
  return valor;
}

function enteroOpcional(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): number | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor <= 0) {
    problemas.push(`"${campo}" tiene que ser null o un entero mayor que 0`);
    return undefined;
  }
  return valor;
}

function enLista<T extends string>(
  crudo: Record<string, unknown>,
  campo: string,
  validos: readonly T[],
  problemas: string[],
): T | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string" || !validos.includes(valor as T)) {
    problemas.push(`"${campo}" tiene que ser null o uno de: ${validos.join(", ")}`);
    return undefined;
  }
  return valor as T;
}

function listaDeTextos(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string[] | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor) || valor.some((e) => typeof e !== "string")) {
    problemas.push(`"${campo}" tiene que ser una lista de textos`);
    return undefined;
  }
  return valor as string[];
}

/**
 * Igual que `enLista`, pero `null` NO es un valor valido.
 *
 * Para el estado no existe el "sin valor": una tarea siempre esta en alguno de
 * los cuatro. Aceptar null ahi seria aceptar un estado que no existe. El error
 * de tipos que obligo a separar esta funcion fue real: `null` se estaba colando
 * como si fuera un estado valido.
 */
function enListaSinNull<T extends string>(
  crudo: Record<string, unknown>,
  campo: string,
  validos: readonly T[],
  problemas: string[],
): T | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "string" || !validos.includes(valor as T)) {
    problemas.push(`"${campo}" tiene que ser uno de: ${validos.join(", ")}`);
    return undefined;
  }
  return valor as T;
}

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
  if (tarea === null) return error(404, `No existe la tarea ${id}`);
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
  if (tarea === null) return error(404, `No existe la tarea ${id}`);

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
  if (tarea === null) return error(404, `No existe la tarea ${id}`);

  await almacen.eliminar(id);
  return { codigo: 204, cuerpo: null, cambio: true };
}

// ---------------------------------------------------------------------------
// El punto de entrada
// ---------------------------------------------------------------------------

/**
 * Atiende las rutas de la API.
 *
 * Devuelve `null` si la ruta no es de la API: asi el servidor puede seguir con
 * las suyas (`/`, `/api/salud`) sin que esta capa sepa que existen.
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
    if (falla instanceof SolicitudInvalida) {
      return error(400, "La solicitud no es valida", falla.problemas);
    }
    throw falla;
  }
}

// ---------------------------------------------------------------------------
// Pomodoros (C12 y C22)
//
// Va en el mismo archivo que las tareas y no en uno aparte porque reusa todo lo
// de arriba: los validadores de cuerpo, la forma de los errores y los codigos.
// Si el archivo sigue creciendo, el paso siguiente es extraer lo comun
// (RespuestaApi, SolicitudInvalida y los validadores) a un modulo propio.
// ---------------------------------------------------------------------------

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
  if (pomodoro === null) return error(404, `No existe el pomodoro ${id}`);
  return { codigo: 200, cuerpo: verPomodoro(pomodoro, ahora) };
}

async function cerrarPomodoro(
  id: string,
  cuerpoCrudo: string,
  almacen: Almacen<Pomodoro>,
  ahora: Date,
): Promise<RespuestaApi> {
  const pomodoro = await almacen.buscar(id);
  if (pomodoro === null) return error(404, `No existe el pomodoro ${id}`);

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
    if (falla instanceof SolicitudInvalida) {
      return error(400, "La solicitud no es valida", falla.problemas);
    }
    throw falla;
  }
}