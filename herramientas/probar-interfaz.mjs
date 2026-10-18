// Ejecuta publico/app.js FUERA del navegador: con un DOM de mentira, pero
// contra el servidor de verdad.
//
// POR QUE EXISTE
//
// El JavaScript de la interfaz no tiene pruebas, y "abrir el navegador y ver"
// no es una verificacion que se pueda repetir ni que quede registrada. Esto no
// reemplaza al navegador: reemplaza al "deberia andar". Prueba que el modulo
// carga, que habla con la API, que dibuja las cuatro columnas y que mete las
// tareas adentro.
//
// Se corre con el servidor levantado:
//   node herramientas/probar-interfaz.mjs
//   $env:BASE="http://127.0.0.1:3000"; node herramientas/probar-interfaz.mjs

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

let fallos = 0;
function afirmar(condicion, descripcion) {
  if (condicion) {
    console.log(`  ok   ${descripcion}`);
  } else {
    console.log(`  FALLA ${descripcion}`);
    fallos = fallos + 1;
  }
}

// ---------------------------------------------------------------------------
// Un DOM de mentira, con lo justo que usa app.js
// ---------------------------------------------------------------------------

class ElementoFalso {
  constructor(etiqueta) {
    this.etiqueta = etiqueta;
    this.hijos = [];
    this.texto = "";
    this.clase = "";
    this.atributos = new Map();
    this.escuchas = new Map();
    this.dataset = {};
    this.estilo = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.draggable = false;
    this.title = "";
    const self = this;
    this.classList = {
      add: (c) => { if (!self.clase.split(" ").includes(c)) self.clase = `${self.clase} ${c}`.trim(); },
      remove: (c) => { self.clase = self.clase.split(" ").filter((x) => x !== c).join(" "); },
      contains: (c) => self.clase.split(" ").includes(c),
    };
  }

  get className() { return this.clase; }
  set className(valor) { this.clase = valor; }

  get textContent() {
    if (this.hijos.length === 0) return this.texto;
    return this.hijos.map((h) => h.textContent).join("");
  }
  set textContent(valor) { this.texto = String(valor); this.hijos = []; }

  append(...nodos) { for (const n of nodos) this.hijos.push(n); }
  appendChild(nodo) { this.hijos.push(nodo); return nodo; }
  replaceChildren(...nodos) { this.hijos = nodos; }
  remove() {}
  addEventListener(tipo, fn) {
    if (!this.escuchas.has(tipo)) this.escuchas.set(tipo, []);
    this.escuchas.get(tipo).push(fn);
  }
  async disparar(tipo, evento = {}) {
    for (const fn of this.escuchas.get(tipo) ?? []) await fn({ preventDefault() {}, ...evento });
  }
  reset() {
    for (const hijo of this.hijos) hijo.value = "";
  }
  showModal() { this.abierto = true; }
  close() { this.abierto = false; }

  /** Todos los descendientes, para poder buscar por clase. */
  descendientes() {
    const todos = [];
    for (const hijo of this.hijos) {
      todos.push(hijo);
      if (typeof hijo.descendientes === "function") todos.push(...hijo.descendientes());
    }
    return todos;
  }

  porClase(clase) { return this.descendientes().filter((e) => e.clase.split(" ").includes(clase)); }
}

/** Los campos que app.js espera encontrar en cada formulario. */
function formularioConCampos(etiqueta, nombres) {
  const formulario = new ElementoFalso(etiqueta);
  for (const nombre of nombres) formulario[nombre] = new ElementoFalso("input");
  // reset() de verdad: en un navegador lo hace el propio formulario. Aca hay
  // que limpiar los campos a mano, porque no son hijos del elemento.
  formulario.reset = () => {
    for (const nombre of nombres) {
      formulario[nombre].value = "";
      formulario[nombre].checked = false;
    }
  };
  return formulario;
}

const porId = new Map();
porId.set("#tablero", new ElementoFalso("main"));
porId.set("#resumen", new ElementoFalso("p"));
porId.set("#aviso", new ElementoFalso("p"));
porId.set("#editar-id", new ElementoFalso("span"));
porId.set("#cancelar-edicion", new ElementoFalso("button"));
porId.set("#refrescar", new ElementoFalso("button"));
porId.set("#dialogo-editar", new ElementoFalso("dialog"));
porId.set(
  "#formulario-nueva",
  formularioConCampos("form", ["titulo", "venceEl"]),
);
porId.set(
  "#formulario-editar",
  formularioConCampos("form", [
    "titulo", "detalle", "venceEl", "estimacionMin", "balde", "dimension", "etiquetas", "impostergable",
  ]),
);

// El foco: el stub tiene que conocer sus ids, y los botones de duracion, porque
// el JavaScript los busca con querySelectorAll.
porId.set("#foco-libre", new ElementoFalso("div"));
porId.set("#foco-corriendo", new ElementoFalso("div"));
porId.set("#reloj", new ElementoFalso("span"));
porId.set("#foco-tarea", new ElementoFalso("span"));
porId.set("#terminar-pomodoro", new ElementoFalso("button"));

const botonesDuracion = [new ElementoFalso("button"), new ElementoFalso("button")];
botonesDuracion[0].dataset.duracion = "25";
botonesDuracion[1].dataset.duracion = "50";

globalThis.document = {
  querySelector: (selector) => {
    if (!porId.has(selector)) porId.set(selector, new ElementoFalso("div"));
    return porId.get(selector);
  },
  createElement: (etiqueta) => new ElementoFalso(etiqueta),
  querySelectorAll: (selector) => (selector === "[data-duracion]" ? botonesDuracion : []),
};
globalThis.confirm = () => true;

// fetch relativo -> absoluto contra el servidor de verdad
const fetchReal = globalThis.fetch;
globalThis.fetch = (ruta, opciones) => fetchReal(new URL(ruta, BASE), opciones);

// ---------------------------------------------------------------------------
// La prueba
// ---------------------------------------------------------------------------

console.log(`Servidor: ${BASE}`);
console.log("Cargando publico/app.js con el DOM de mentira...\n");

await import("../publico/app.js");
await new Promise((seguir) => setTimeout(seguir, 400));

const tablero = porId.get("#tablero");
const columnas = tablero.hijos;

afirmar(columnas.length === 4, `se dibujaron 4 columnas (son ${columnas.length})`);
afirmar(tablero.porClase("columna").length === 4, "las 4 tienen la clase columna");

const resumen = porId.get("#resumen").textContent;
afirmar(/en total/.test(resumen), `el resumen se completo: "${resumen}"`);

// Crear una tarea por el mismo camino que usa el boton.
const formularioNueva = porId.get("#formulario-nueva");
const titulo = `Tarea de prueba ${Date.now()}`;
formularioNueva.titulo.value = titulo;
await formularioNueva.disparar("submit");

const tarjetas = tablero.porClase("tarjeta");
afirmar(
  tarjetas.some((t) => t.textContent.includes(titulo)),
  `la tarea creada aparece en el tablero ("${titulo}")`,
);
afirmar(formularioNueva.titulo.value === "", "el formulario se limpio despues de crear");

/**
 * Mover y borrar, que necesita que la tarjeta exista.
 *
 * Es una funcion y no codigo suelto por un motivo concreto: si la tarea no se
 * creo (por ejemplo, porque el servidor no tiene la API), el resto del script
 * no tiene nada que medir. Sin esta guarda tiraba "Cannot read properties of
 * undefined" y no llegaba NUNCA a las comprobaciones del final, que son las que
 * dicen que salio mal. Un verificador que se cae en el peor momento no sirve.
 */
/**
 * El boton de la tarjeta que dice `simbolo`.
 *
 * Por simbolo y NO por posicion: cuando se agrego el ▶ de arrancar pomodoro,
 * todos los indices corrieron uno y la prueba paso a clickear "editar" en lugar
 * de "borrar". Buscar por lo que dice el boton no se rompe cuando la fila crece.
 */
function assertBoton(boton, simbolo) {
  if (boton === undefined) {
    afirmar(false, `no se encontro el boton "${simbolo}" en la tarjeta`);
    process.exit(1);
  }
}

function botonConSimbolo(tarjeta, simbolo) {
  const fila = tarjeta.porClase("botones")[0];
  return fila.hijos.find((b) => b.textContent === simbolo);
}

async function probarMovimientoYBorrado(tarjeta) {
  const botones = tarjeta.porClase("botones")[0].hijos;
  afirmar(botones.length === 5, `la tarjeta tiene 5 botones, con el de arrancar pomodoro (tiene ${botones.length})`);

  // OJO: hay que releer tablero.hijos en cada medicion. dibujar() llama a
  // replaceChildren(), que REEMPLAZA el array de hijos: una referencia guardada
  // antes apunta al array viejo y miente. (Fue un falso positivo la primera vez.)
  function indiceDe(texto) {
    return porId
      .get("#tablero")
      .hijos.findIndex((c) => c.porClase("tarjeta").some((t) => t.textContent.includes(texto)));
  }

  const indiceAntes = indiceDe(titulo);
  const botonDerecha = botonConSimbolo(tarjeta, "→");
  assertBoton(botonDerecha, "→");
  await botonDerecha.disparar("click");
  await new Promise((seguir) => setTimeout(seguir, 150));
  const indiceDespues = indiceDe(titulo);
  afirmar(
    indiceDespues === indiceAntes + 1,
    `la flecha -> la movio de columna (${indiceAntes} -> ${indiceDespues})`,
  );

  const tarjetaDespues = tablero.porClase("tarjeta").find((t) => t.textContent.includes(titulo));
  const botonBorrar = botonConSimbolo(tarjetaDespues, "✕");
  assertBoton(botonBorrar, "✕");
  await botonBorrar.disparar("click");
  await new Promise((seguir) => setTimeout(seguir, 200));
  afirmar(
    !tablero.porClase("tarjeta").some((t) => t.textContent.includes(titulo)),
    "el boton de borrar la saco del tablero",
  );
}

const tarjeta = tarjetas.find((t) => t.textContent.includes(titulo));
if (tarjeta === undefined) {
  afirmar(false, "no se encontro la tarjeta creada: no se puede probar mover ni borrar");
} else {
  await probarMovimientoYBorrado(tarjeta);
}

// --- el foco (pomodoro) ---
console.log("\nFoco:");

if (porId.get("#foco-corriendo").hidden === false) {
  // El servidor ya tenia un pomodoro andando. No se puede comprobar el
  // arranque, y tampoco corresponde terminarlo: puede ser el de alguien.
  console.log("  (ya habia un pomodoro en curso: se saltea la comprobacion del arranque)");
  console.log("  (para verificarla, correr contra un servidor con datos limpios)");
  process.exit(fallos === 0 ? 0 : 1);
}

afirmar(porId.get("#foco-corriendo").hidden === true, "al arrancar no hay ningun pomodoro corriendo");
afirmar(porId.get("#foco-libre").hidden === false, "y se ve el boton de arrancar");

await botonesDuracion[0].disparar("click");
await new Promise((seguir) => setTimeout(seguir, 400));

afirmar(porId.get("#foco-corriendo").hidden === false, "al arrancar uno, aparece el reloj");
afirmar(porId.get("#foco-libre").hidden === true, "y se esconde el boton de arrancar");
afirmar(
  /^\d{2}:\d{2}$/.test(porId.get("#reloj").textContent),
  `el reloj muestra mm:ss ("${porId.get("#reloj").textContent}")`,
);

await porId.get("#terminar-pomodoro").disparar("click");
await new Promise((seguir) => setTimeout(seguir, 400));

afirmar(porId.get("#foco-corriendo").hidden === true, "al terminarlo, el reloj se va");
afirmar(porId.get("#foco-libre").hidden === false, "y vuelve el boton de arrancar");

// El aviso de error: si quedo visible, se muestra QUE dice. El texto importa
// tanto como el hecho de que aparezca.
const aviso = porId.get("#aviso");
if (aviso.hidden === true) {
  afirmar(true, "no quedo ningun aviso de error visible");
} else {
  afirmar(false, `quedo un aviso visible: "${aviso.textContent}"`);
}

console.log("");
if (fallos === 0) {
  console.log("Todo bien.");
} else {
  console.log(`${fallos} comprobaciones fallaron.`);
}

// process.exit y no process.exitCode: si quedo un setInterval andando (el del
// reloj), el proceso no terminaria nunca y el comando se quedaria colgado sin
// decir nada. Un verificador que no termina no sirve.
process.exit(fallos === 0 ? 0 : 1);