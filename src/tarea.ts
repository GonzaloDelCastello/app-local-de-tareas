// El dominio: que es una Tarea y que se puede hacer con ella.
//
// POR QUE UNA CLASE Y NO UN OBJETO SUELTO CON FUNCIONES
//
// Porque hay invariantes que tienen que valer SIEMPRE, y son varias:
//   - un titulo no puede quedar vacio
//   - una tarea cerrada tiene fecha de cierre, y una abierta no
//   - el estado tiene que ser uno de los cuatro validos
//   - el orden no puede ser negativo
//
// Con los datos sueltos, cada lugar del codigo que los toca tendria que
// acordarse de mantener todo eso, y tarde o temprano uno se olvida. Con la
// clase, la invariante se sostiene en UN solo lugar: el constructor y validar().
//
// El precio de la clase es que el JSON no guarda metodos: al leer un archivo
// volves a tener un objeto plano. Por eso existen aJSON() y desdeJSON(), y por
// eso existen DOS tipos: TareaJSON (la forma de los datos) y Tarea (el objeto).

import type { Balde, DatosNuevaTarea, Dimension, Estado, TareaJSON } from "./tipos.ts";
import { BALDES, COLUMNAS, DIMENSIONES, ESTADOS, ESTADOS_CERRADOS } from "./tipos.ts";

/** El unico formato de fecha valido: AAAA-MM-DD. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/** Convierte "AAAA-MM-DD" a milisegundos UTC. Devuelve NaN si no es valida. */
function aMilisegundos(fecha: string): number {
  if (!FORMATO_FECHA.test(fecha)) return Number.NaN;
  return Date.parse(`${fecha}T00:00:00Z`);
}

export class Tarea {
  // ---------------------------------------------------------------------------
  // ATRIBUTOS
  //
  // Se declaran uno por uno y se asignan a mano en el constructor. No se puede
  // usar `constructor(readonly id: string)`: esa forma abreviada genera codigo
  // y Node, que solo BORRA los tipos, la rechaza. Es la misma familia de
  // problemas que el `enum`.
  // ---------------------------------------------------------------------------

  // --- Identidad ---
  readonly id: string;

  // --- Contenido ---
  titulo: string;
  detalle: string;

  // --- Estado y posicion ---
  estado: Estado;
  /** Posicion dentro de la columna. Sin esto, arrastrar y soltar no se guarda. */
  orden: number;

  // --- Fechas (AAAA-MM-DD) ---
  creadaEl: string;
  actualizadaEl: string;
  cerradaEl: string | null;

  // --- Clasificacion ---
  balde: Balde | null;
  dependenciasExternas: boolean;
  dimension: Dimension | null;
  etiquetas: string[];

  // --- Tiempo ---
  venceEl: string | null;
  impostergable: boolean;
  estimacionMin: number | null;

  // --- Trazabilidad ---
  origen: string;

  /**
   * Se construye desde la forma completa. Normalmente no se llama directo:
   * se usa `Tarea.crear()` (tarea nueva) o `Tarea.desdeJSON()` (leida de un archivo).
   */
  constructor(datos: TareaJSON) {
    this.id = datos.id;
    this.titulo = datos.titulo;
    this.detalle = datos.detalle;
    this.estado = datos.estado;
    this.orden = datos.orden;
    this.creadaEl = datos.creadaEl;
    this.actualizadaEl = datos.actualizadaEl;
    this.cerradaEl = datos.cerradaEl;
    this.balde = datos.balde;
    this.dependenciasExternas = datos.dependenciasExternas;
    this.dimension = datos.dimension;
    this.etiquetas = datos.etiquetas;
    this.venceEl = datos.venceEl;
    this.impostergable = datos.impostergable;
    this.estimacionMin = datos.estimacionMin;
    this.origen = datos.origen;

    const problemas = this.validar();
    if (problemas.length > 0) {
      throw new Error(`Tarea invalida (${this.id || "sin id"}): ${problemas.join("; ")}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CONSTRUCCION
  // ---------------------------------------------------------------------------

  /**
   * Crea una tarea nueva. Los valores que no se pasan toman el default de aca,
   * en un solo lugar, y no repartidos por todo el programa.
   */
  static crear(datos: DatosNuevaTarea, id: string, hoy: string): Tarea {
    return new Tarea({
      id,
      titulo: datos.titulo,
      detalle: datos.detalle ?? "",
      estado: "pendiente",
      orden: 0,
      creadaEl: hoy,
      actualizadaEl: hoy,
      cerradaEl: null,
      balde: datos.balde ?? null,
      dependenciasExternas: datos.dependenciasExternas ?? false,
      dimension: datos.dimension ?? null,
      etiquetas: datos.etiquetas ?? [],
      venceEl: datos.venceEl ?? null,
      impostergable: datos.impostergable ?? false,
      estimacionMin: datos.estimacionMin ?? null,
      origen: datos.origen ?? "",
    });
  }

  /**
   * Reconstruye una tarea desde lo que devolvio `JSON.parse`.
   *
   * El `as` es inevitable: TypeScript no puede verificar el contenido de un
   * archivo, eso pasa en runtime. Por eso la verificacion de verdad la hace
   * `validar()`, que corre en el constructor. Los tipos no validan nada.
   */
  static desdeJSON(dato: unknown): Tarea {
    if (typeof dato !== "object" || dato === null || Array.isArray(dato)) {
      throw new Error("una tarea guardada tiene que ser un objeto JSON");
    }
    return new Tarea(dato as TareaJSON);
  }

  /** La forma que se guarda. Los metodos NO viajan al JSON. */
  aJSON(): TareaJSON {
    return {
      id: this.id,
      titulo: this.titulo,
      detalle: this.detalle,
      estado: this.estado,
      orden: this.orden,
      creadaEl: this.creadaEl,
      actualizadaEl: this.actualizadaEl,
      cerradaEl: this.cerradaEl,
      balde: this.balde,
      dependenciasExternas: this.dependenciasExternas,
      dimension: this.dimension,
      etiquetas: [...this.etiquetas],
      venceEl: this.venceEl,
      impostergable: this.impostergable,
      estimacionMin: this.estimacionMin,
      origen: this.origen,
    };
  }

  // ---------------------------------------------------------------------------
  // METODOS
  // ---------------------------------------------------------------------------

  /**
   * Devuelve la lista de problemas. Vacia quiere decir que la tarea esta bien.
   *
   * Devuelve la lista en lugar de lanzar para que se pueda usar en dos lugares:
   * el constructor lanza si hay algo, y el servidor puede responderle al
   * navegador que campo esta mal, sin que se caiga.
   */
  validar(): string[] {
    const problemas: string[] = [];

    if (typeof this.id !== "string" || this.id.trim() === "") {
      problemas.push("el id no puede estar vacio");
    }
    if (typeof this.titulo !== "string" || this.titulo.trim() === "") {
      problemas.push("el titulo no puede estar vacio");
    }
    if (!ESTADOS.includes(this.estado)) {
      problemas.push(`estado invalido: ${String(this.estado)} (validos: ${ESTADOS.join(", ")})`);
    }
    if (!Number.isInteger(this.orden) || this.orden < 0) {
      problemas.push("el orden tiene que ser un entero mayor o igual a 0");
    }

    for (const [campo, valor] of [["creadaEl", this.creadaEl], ["actualizadaEl", this.actualizadaEl]] as const) {
      if (typeof valor !== "string" || !FORMATO_FECHA.test(valor)) {
        problemas.push(`${campo} tiene que ser una fecha AAAA-MM-DD`);
      }
    }
    if (this.cerradaEl !== null && (typeof this.cerradaEl !== "string" || !FORMATO_FECHA.test(this.cerradaEl))) {
      problemas.push("cerradaEl tiene que ser null o una fecha AAAA-MM-DD");
    }
    if (this.venceEl !== null && (typeof this.venceEl !== "string" || !FORMATO_FECHA.test(this.venceEl))) {
      problemas.push("venceEl tiene que ser null o una fecha AAAA-MM-DD");
    }

    // Las dos invariantes que justifican que esto sea una clase:
    if (this.estaCerrada() && this.cerradaEl === null) {
      problemas.push(`una tarea en estado "${this.estado}" necesita fecha de cierre`);
    }
    if (!this.estaCerrada() && this.cerradaEl !== null) {
      problemas.push(`una tarea en estado "${this.estado}" no puede tener fecha de cierre`);
    }

    if (this.balde !== null && !BALDES.includes(this.balde)) {
      problemas.push(`balde invalido: ${String(this.balde)}`);
    }
    if (this.dimension !== null && !DIMENSIONES.includes(this.dimension)) {
      problemas.push(`dimension invalida: ${String(this.dimension)}`);
    }
    if (!Array.isArray(this.etiquetas) || this.etiquetas.some((e) => typeof e !== "string")) {
      problemas.push("etiquetas tiene que ser una lista de textos");
    }
    if (this.estimacionMin !== null && (!Number.isInteger(this.estimacionMin) || this.estimacionMin <= 0)) {
      problemas.push("estimacionMin tiene que ser null o un entero positivo");
    }

    return problemas;
  }

  /** Solo `hecha` y `descartada` cierran una tarea. */
  estaCerrada(): boolean {
    return ESTADOS_CERRADOS.includes(this.estado);
  }

  /**
   * Mueve la tarea a otra columna.
   *
   * Mantiene las dos invariantes de una sola vez: al cerrar pone la fecha de
   * cierre, al reabrir la saca. Si se hiciera desde afuera, habria que
   * acordarse en cada lugar.
   *
   * Es atomico: o cambia todo, o no cambia nada. Si el resultado quedara
   * invalido, la tarea vuelve como estaba antes de lanzar el error.
   */
  moverA(estado: Estado, orden: number, hoy: string): void {
    if (!ESTADOS.includes(estado)) {
      throw new Error(`estado invalido: ${String(estado)}`);
    }

    const anterior = {
      estado: this.estado,
      orden: this.orden,
      actualizadaEl: this.actualizadaEl,
      cerradaEl: this.cerradaEl,
    };

    this.estado = estado;
    this.orden = orden;
    this.actualizadaEl = hoy;
    this.cerradaEl = ESTADOS_CERRADOS.includes(estado) ? (this.cerradaEl ?? hoy) : null;

    const problemas = this.validar();
    if (problemas.length > 0) {
      Object.assign(this, anterior);
      throw new Error(`No se puede mover la tarea ${this.id}: ${problemas.join("; ")}`);
    }
  }

  /** Vencio: tiene fecha, esa fecha ya paso, y sigue abierta. */
  estaVencida(hoy: string): boolean {
    if (this.venceEl === null || this.estaCerrada()) return false;
    return aMilisegundos(this.venceEl) < aMilisegundos(hoy);
  }

  /**
   * Cuantos dias faltan para que venza. Negativo si ya paso, `null` si no vence.
   *
   * Se restan milisegundos UTC de dos fechas sin hora, asi que da un numero
   * entero exacto: no hay horario de verano ni zona que pueda correrlo un dia.
   */
  diasHastaVencer(hoy: string): number | null {
    if (this.venceEl === null) return null;
    const diferencia = aMilisegundos(this.venceEl) - aMilisegundos(hoy);
    return Math.round(diferencia / MILISEGUNDOS_POR_DIA);
  }

  /**
   * La linea que esta tarea ocupa en el tablero publicado para los agentes.
   *
   * Usa el mismo dialecto que ya usa `rendimiento\bandeja.md`, a proposito:
   * `- [ ] **Titulo** · modificador · modificador`. Asi el agente lo lee sin
   * que haya que explicarle un formato nuevo.
   */
  resumenMarkdown(): string {
    // La marca va SEPARADA de los modificadores: entre "- [ ]" y el titulo va un
    // espacio, no un " · ". Este separador de mas lo encontro la prueba, no la
    // lectura del codigo.
    const marca = this.estaCerrada() ? "- [x]" : "- [ ]";
    const partes = [`**${this.titulo}**`, `\`${this.id}\``];
    if (this.venceEl !== null) partes.push(`vence ${this.venceEl}`);
    if (this.impostergable) partes.push("**impostergable**");
    if (this.balde !== null) partes.push(`balde ${this.balde}`);
    if (this.dimension !== null) partes.push(`es de \`${this.dimension}\``);
    if (this.etiquetas.length > 0) partes.push(this.etiquetas.map((e) => `#${e}`).join(" "));
    return `${marca} ${partes.join(" · ")}`;
  }
}

/**
 * La vista derivada (C6): el tablero en markdown que leen `gabinete` y
 * `rendimiento`.
 *
 * No es una fuente de verdad y no se edita a mano: se regenera desde los datos.
 * Si este archivo y los datos se contradicen, ganan los datos (H4).
 */
export function proyectarTablero(tareas: Tarea[], generadoEl: string): string {
  const lineas: string[] = [
    "# Tablero",
    "",
    `> Vista derivada, generada por la app el ${generadoEl}. **No editar a mano:** se regenera.`,
    "> Los datos son la fuente de verdad. Si este tablero los contradice, ganan los datos.",
    "",
  ];

  for (const columna of COLUMNAS) {
    const enLaColumna = tareas
      .filter((t) => t.estado === columna)
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

    lineas.push(`## ${columna} (${enLaColumna.length})`, "");
    if (enLaColumna.length === 0) {
      lineas.push("_(vacia)_", "");
      continue;
    }
    for (const t of enLaColumna) lineas.push(t.resumenMarkdown());
    lineas.push("");
  }

  const vencidas = tareas.filter((t) => t.estaVencida(generadoEl));
  if (vencidas.length > 0) {
    lineas.push("## Vencidas", "");
    for (const t of vencidas) lineas.push(t.resumenMarkdown());
    lineas.push("");
  }

  return `${lineas.join("\n")}\n`;
}