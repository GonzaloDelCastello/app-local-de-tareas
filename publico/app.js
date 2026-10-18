// La interfaz del tablero (Etapa 4).
//
// HABLA CON LA API Y NADA MAS. No guarda una copia propia de los datos: lo que
// muestra es lo ultimo que devolvio el servidor, y despues de cada cambio
// vuelve a leer. Es la decision de "el servidor manda".
//
// Tiene un costo (una ida y vuelta mas en cada cambio) y una virtud enorme: no
// hay dos verdades que puedan separarse. El problema de fondo de la Etapa 4 es
// que el estado vive en DOS lugares, el servidor y el DOM; la unica forma de
// que no diverjan es que uno de los dos sea el que manda.
//
// Se aplica el cambio en pantalla al instante para que se sienta rapido, pero
// si el servidor dice que no, se vuelve a leer y el estado real pisa al
// optimista. Un cambio que se ve y no se guardo es peor que uno que tarda
// medio segundo.

const COLUMNAS = [
  { estado: "pendiente", nombre: "Pendiente" },
  { estado: "en-curso", nombre: "En curso" },
  { estado: "hecha", nombre: "Hecha" },
  { estado: "descartada", nombre: "Descartada" },
];

const CERRADAS = ["hecha", "descartada"];

const tablero = document.querySelector("#tablero");
const resumen = document.querySelector("#resumen");
const aviso = document.querySelector("#aviso");
const formularioNueva = document.querySelector("#formulario-nueva");
const dialogo = document.querySelector("#dialogo-editar");
const formularioEditar = document.querySelector("#formulario-editar");
const editarId = document.querySelector("#editar-id");

/** Las ultimas tareas que devolvio el servidor. Es una copia, no la verdad. */
let tareas = [];

/** El id que se esta arrastrando, o null. */
let arrastrando = null;

// ---------------------------------------------------------------------------
// Hablar con la API
// ---------------------------------------------------------------------------

/**
 * Hace la peticion y devuelve el cuerpo ya parseado.
 *
 * Si el servidor contesta con un error, tira una excepcion con el mensaje Y los
 * `detalles` que manda la API. Esos detalles nombran el campo que fallo: sin
 * ellos, el usuario solo sabria que "algo salio mal".
 */
async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch (falla) {
    // Aca se cae si el servidor no esta corriendo, o si se corto la conexion.
    throw new Error(`No se pudo hablar con el servidor: ${falla.message}`);
  }

  const texto = await respuesta.text();

  let datos = null;
  if (texto !== "") {
    try {
      datos = JSON.parse(texto);
    } catch {
      // Un cuerpo que no es JSON casi siempre significa una sola cosa: esta
      // pagina NO la sirvio el servidor de la app. Pasa si se abre el HTML con
      // doble clic, o con una extension tipo Live Server, que sirve archivos
      // pero no tiene la API. Sin este mensaje, lo unico que se ve es
      // "Unexpected token '<'", que no le dice nada a nadie.
      throw new Error(
        "El servidor contesto algo que no es JSON (" + respuesta.status + "). " +
          "Esta corriendo el servidor? Se levanta con npm.cmd start y se abre http://127.0.0.1:3000",
      );
    }
  }

  if (!respuesta.ok) {
    const partes = [datos?.error ?? `Error ${respuesta.status}`];
    if (Array.isArray(datos?.detalles)) partes.push(...datos.detalles);
    throw new Error(partes.join(" · "));
  }
  return datos;
}

function mostrarAviso(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
}

function limpiarAviso() {
  aviso.hidden = true;
  aviso.textContent = "";
}

// ---------------------------------------------------------------------------
// La fecha de hoy
// ---------------------------------------------------------------------------

/**
 * La fecha de hoy como AAAA-MM-DD, en la hora LOCAL del navegador.
 *
 * NO se usa toISOString().slice(0, 10): eso devuelve la fecha en UTC, y a las
 * 22 de la Argentina ya es el dia siguiente. La convencion del proyecto es la
 * fecha del calendario, la que marca el reloj de la pared.
 */
function hoyLocal() {
  const ahora = new Date();
  const dosDigitos = (numero) => String(numero).padStart(2, "0");
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

// ---------------------------------------------------------------------------
// Dibujar
// ---------------------------------------------------------------------------

function crearEtiqueta(texto, clase) {
  const elemento = document.createElement("span");
  if (clase !== undefined) elemento.className = clase;
  // textContent y NUNCA innerHTML: el titulo lo escribe una persona. Con
  // innerHTML, un titulo que contenga <script> o <img onerror=...> se
  // ejecutaria en el navegador. Es la via clasica de XSS.
  elemento.textContent = texto;
  return elemento;
}

function crearTarjeta(tarea, hoy) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "tarjeta";
  if (CERRADAS.includes(tarea.estado)) tarjeta.classList.add("cerrada");
  if (tarea.impostergable) tarjeta.classList.add("impostergable");
  tarjeta.draggable = true;

  tarjeta.addEventListener("dragstart", () => {
    arrastrando = tarea.id;
    tarjeta.classList.add("arrastrando");
  });
  tarjeta.addEventListener("dragend", () => {
    arrastrando = null;
    tarjeta.classList.remove("arrastrando");
  });

  const titulo = crearEtiqueta(tarea.titulo, "titulo");
  tarjeta.append(titulo);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.append(crearEtiqueta(tarea.id, "identificador"));

  if (tarea.venceEl !== null) {
    const vencida = tarea.venceEl < hoy && !CERRADAS.includes(tarea.estado);
    const vence = crearEtiqueta(`vence ${tarea.venceEl}`, vencida ? "vence vencida" : "vence");
    meta.append(vence);
  }
  if (tarea.impostergable) meta.append(crearEtiqueta("impostergable", "fuerte"));
  if (tarea.balde !== null) meta.append(crearEtiqueta(`balde ${tarea.balde}`, "etiqueta"));
  if (tarea.dimension !== null) meta.append(crearEtiqueta(tarea.dimension, "etiqueta"));
  if (tarea.estimacionMin !== null) meta.append(crearEtiqueta(`${tarea.estimacionMin} min`, "etiqueta"));
  for (const etiqueta of tarea.etiquetas) {
    meta.append(crearEtiqueta(`#${etiqueta}`, "etiqueta"));
  }
  tarjeta.append(meta);

  const botones = document.createElement("div");
  botones.className = "botones";

  const orden = COLUMNAS.findIndex((c) => c.estado === tarea.estado);
  const anterior = COLUMNAS[orden - 1];
  const siguiente = COLUMNAS[orden + 1];

  botones.append(
    boton("←", `Mover a ${anterior?.nombre ?? ""}`, anterior === undefined, () => mover(tarea.id, anterior.estado)),
    boton("→", `Mover a ${siguiente?.nombre ?? ""}`, siguiente === undefined, () => mover(tarea.id, siguiente.estado)),
    // Arranca un pomodoro en ESTA tarea. La duracion es la de por defecto; para
    // otra, se arranca desde la barra de foco (que no tiene tarea asociada).
    boton("▶", "Empezar un pomodoro en esta tarea", false, () => arrancarPomodoro(25, tarea.id)),
    boton("✎", "Editar", false, () => abrirEdicion(tarea.id)),
    boton("✕", "Borrar", false, () => borrar(tarea.id)),
  );
  tarjeta.append(botones);

  return tarjeta;
}

function boton(texto, titulo, deshabilitado, alHacerClic) {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.textContent = texto;
  elemento.title = titulo;
  elemento.disabled = deshabilitado;
  elemento.addEventListener("click", alHacerClic);
  return elemento;
}

function dibujar() {
  const hoy = hoyLocal();
  tablero.replaceChildren();

  for (const columna of COLUMNAS) {
    const deLaColumna = tareas
      .filter((t) => t.estado === columna.estado)
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

    const seccion = document.createElement("section");
    seccion.className = "columna";
    // El estado como atributo del elemento, para que el CSS pueda pintar el
    // punto de color de cada columna sin que el JavaScript sepa de colores.
    seccion.dataset.estado = columna.estado;

    // Soltar una tarjeta en la columna. dragover tiene que hacer
    // preventDefault(): si no, el navegador no permite soltar.
    seccion.addEventListener("dragover", (evento) => {
      evento.preventDefault();
      seccion.classList.add("encima");
    });
    seccion.addEventListener("dragleave", () => seccion.classList.remove("encima"));
    seccion.addEventListener("drop", (evento) => {
      evento.preventDefault();
      seccion.classList.remove("encima");
      if (arrastrando !== null && arrastrando !== undefined) {
        const id = arrastrando;
        arrastrando = null;
        mover(id, columna.estado);
      }
    });

    const encabezado = document.createElement("h2");
    encabezado.append(crearEtiqueta(columna.nombre), crearEtiqueta(String(deLaColumna.length), "contador"));
    seccion.append(encabezado);

    if (deLaColumna.length === 0) {
      seccion.append(crearEtiqueta("(vacía)", "vacia"));
    } else {
      for (const tarea of deLaColumna) seccion.append(crearTarjeta(tarea, hoy));
    }

    tablero.append(seccion);
  }

  const abiertas = tareas.filter((t) => !CERRADAS.includes(t.estado));
  const vencidas = abiertas.filter((t) => t.venceEl !== null && t.venceEl < hoy);
  const partes = [`${tareas.length} en total`, `${abiertas.length} abiertas`];
  if (vencidas.length > 0) partes.push(`${vencidas.length} vencidas`);
  resumen.textContent = partes.join(" · ");
}

// ---------------------------------------------------------------------------
// Las operaciones
// ---------------------------------------------------------------------------

async function recargar() {
  const datos = await pedir("GET", "/api/tareas");
  tareas = datos.tareas;
  dibujar();
}

async function crear(evento) {
  evento.preventDefault();
  limpiarAviso();

  const titulo = formularioNueva.titulo.value.trim();
  if (titulo === "") return;

  const cuerpo = { titulo };
  if (formularioNueva.venceEl.value !== "") cuerpo.venceEl = formularioNueva.venceEl.value;

  try {
    await pedir("POST", "/api/tareas", cuerpo);
    formularioNueva.reset();
    await recargar();
  } catch (falla) {
    mostrarAviso(`No se pudo crear: ${falla.message}`);
  }
}

/**
 * Mueve una tarjeta de columna.
 *
 * El `orden` se calcula mirando cuantas hay en la columna destino: la movida va
 * al final. Es una regla simple, y suficiente mientras no haya reordenamiento
 * manual dentro de la columna.
 */
async function mover(id, estado) {
  limpiarAviso();
  const enDestino = tareas.filter((t) => t.estado === estado).length;

  try {
    await pedir("PATCH", `/api/tareas/${id}`, { estado, orden: enDestino });
    await recargar();
  } catch (falla) {
    mostrarAviso(`No se pudo mover: ${falla.message}`);
    await recargar().catch(() => {});
  }
}

async function borrar(id) {
  limpiarAviso();
  const tarea = tareas.find((t) => t.id === id);
  if (tarea === undefined) return;
  if (!confirm(`¿Borrar "${tarea.titulo}"? No se puede deshacer.`)) return;

  try {
    await pedir("DELETE", `/api/tareas/${id}`);
    await recargar();
  } catch (falla) {
    mostrarAviso(`No se pudo borrar: ${falla.message}`);
  }
}

function abrirEdicion(id) {
  limpiarAviso();
  const tarea = tareas.find((t) => t.id === id);
  if (tarea === undefined) return;

  editarId.textContent = tarea.id;
  formularioEditar.titulo.value = tarea.titulo;
  formularioEditar.detalle.value = tarea.detalle;
  formularioEditar.venceEl.value = tarea.venceEl ?? "";
  formularioEditar.estimacionMin.value = tarea.estimacionMin ?? "";
  formularioEditar.balde.value = tarea.balde ?? "";
  formularioEditar.dimension.value = tarea.dimension ?? "";
  formularioEditar.etiquetas.value = tarea.etiquetas.join(", ");
  formularioEditar.impostergable.checked = tarea.impostergable;
  formularioEditar.dataset.id = id;

  dialogo.showModal();
}

async function guardarEdicion(evento) {
  evento.preventDefault();
  limpiarAviso();
  const id = formularioEditar.dataset.id;

  // La conversion importa: la API espera null para "sin valor", no "". Un
  // string vacio en venceEl es un 400, porque no es una fecha valida.
  const cuerpo = {
    titulo: formularioEditar.titulo.value.trim(),
    detalle: formularioEditar.detalle.value,
    venceEl: formularioEditar.venceEl.value === "" ? null : formularioEditar.venceEl.value,
    estimacionMin:
      formularioEditar.estimacionMin.value === "" ? null : Number(formularioEditar.estimacionMin.value),
    balde: formularioEditar.balde.value === "" ? null : formularioEditar.balde.value,
    dimension: formularioEditar.dimension.value === "" ? null : formularioEditar.dimension.value,
    etiquetas: formularioEditar.etiquetas.value
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e !== ""),
    impostergable: formularioEditar.impostergable.checked,
  };

  try {
    await pedir("PATCH", `/api/tareas/${id}`, cuerpo);
    dialogo.close();
    await recargar();
  } catch (falla) {
    mostrarAviso(`No se pudo guardar: ${falla.message}`);
  }
}

// ---------------------------------------------------------------------------
// El foco (pomodoro)
//
// LA IDEA CENTRAL: el navegador NO lleva la cuenta del tiempo. Recibe del
// servidor cuando empezo y cuanto dura, y en cada segundo RESTA. Si llevara un
// contador propio, recargar la pagina lo perderia, y una pestana suspendida lo
// dejaria mintiendo. Restar dos instantes siempre da bien.
// ---------------------------------------------------------------------------

const focoLibre = document.querySelector("#foco-libre");
const focoCorriendo = document.querySelector("#foco-corriendo");
const reloj = document.querySelector("#reloj");
const focoTarea = document.querySelector("#foco-tarea");

/** El pomodoro que corre ahora, segun el servidor. null si no hay ninguno. */
let pomodoroEnCurso = null;

/** El id del intervalo que mueve el reloj, o null. */
let ticTac = null;

async function cargarFoco() {
  const datos = await pedir("GET", "/api/pomodoros/en-curso");
  pomodoroEnCurso = datos.pomodoro;
  dibujarFoco();
}

function dibujarFoco() {
  focoLibre.hidden = pomodoroEnCurso !== null;
  focoCorriendo.hidden = pomodoroEnCurso === null;

  if (ticTac !== null) {
    clearInterval(ticTac);
    ticTac = null;
  }
  if (pomodoroEnCurso === null) return;

  const tarea = tareas.find((t) => t.id === pomodoroEnCurso.tareaId);
  focoTarea.textContent = tarea === undefined ? "sin tarea" : tarea.titulo;

  moverReloj();
  ticTac = setInterval(moverReloj, 1000);
}

/**
 * Mueve el reloj de la pantalla.
 *
 * Recalcula desde `finPrevisto` y la hora actual en CADA llamada, en lugar de
 * restarle uno al valor anterior. Si acumulara, cada tic sumaria su propio
 * error; y en una pestana en segundo plano, donde el navegador frena los
 * intervalos, el numero quedaria atras y nunca se corregiria.
 */
function moverReloj() {
  if (pomodoroEnCurso === null) return;

  const restantes = Math.max(0, Math.round((Date.parse(pomodoroEnCurso.finPrevisto) - Date.now()) / 1000));
  const minutos = String(Math.floor(restantes / 60)).padStart(2, "0");
  const segundos = String(restantes % 60).padStart(2, "0");
  reloj.textContent = `${minutos}:${segundos}`;

  if (restantes === 0) {
    // Se cumplio. NO hay que avisarle al servidor: el estado se deriva del
    // reloj. Alcanza con volver a preguntar para que el boton aparezca solo.
    if (ticTac !== null) {
      clearInterval(ticTac);
      ticTac = null;
    }
    cargarFoco().catch(() => {});
  }
}

async function arrancarPomodoro(duracionMin, tareaId) {
  limpiarAviso();
  const cuerpo = { duracionMin };
  if (tareaId !== undefined && tareaId !== null) cuerpo.tareaId = tareaId;

  try {
    pomodoroEnCurso = await pedir("POST", "/api/pomodoros", cuerpo);
    dibujarFoco();
  } catch (falla) {
    // El 409 ("ya hay uno en curso") cae aca, y el mensaje del servidor ya
    // explica cual esta corriendo.
    mostrarAviso(`No se pudo arrancar el pomodoro: ${falla.message}`);
    await cargarFoco().catch(() => {});
  }
}

async function terminarPomodoro() {
  if (pomodoroEnCurso === null) return;
  limpiarAviso();

  try {
    await pedir("PATCH", `/api/pomodoros/${pomodoroEnCurso.id}`, { estado: "terminado" });
    pomodoroEnCurso = null;
    dibujarFoco();
  } catch (falla) {
    mostrarAviso(`No se pudo terminar el pomodoro: ${falla.message}`);
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

formularioNueva.addEventListener("submit", crear);
formularioEditar.addEventListener("submit", guardarEdicion);
document.querySelector("#cancelar-edicion").addEventListener("click", () => dialogo.close());
document.querySelector("#refrescar").addEventListener("click", () => {
  limpiarAviso();
  recargar().catch((falla) => mostrarAviso(falla.message));
  cargarFoco().catch(() => {});
});

document.querySelector("#terminar-pomodoro").addEventListener("click", terminarPomodoro);

// Los botones de duracion de la barra de foco. `data-duracion` dice cuanto.
for (const botonDuracion of document.querySelectorAll("[data-duracion]")) {
  botonDuracion.addEventListener("click", () => arrancarPomodoro(Number(botonDuracion.dataset.duracion)));
}

try {
  await recargar();
  await cargarFoco();
} catch (falla) {
  mostrarAviso(`No se pudo cargar el tablero: ${falla.message}`);
}