// El pomodoro: un registro con DOS marcas de tiempo (decision C12 y C22).
//
// POR QUE NO ES UN CONTADOR
//
// Lo facil seria guardar `pomodorosCumplidos: 7` dentro de la tarea. No sirve:
// un entero no se puede auditar, no dice CUANDO se trabajo, y no se puede
// cruzar con el horario. Lo que `rendimiento` necesita saber es a que hora
// cayeron los bloques de foco, para compararlos con las franjas que Gonzalo
// dice que son las buenas. Un numero no responde esa pregunta.
//
// POR QUE UN REGISTRO Y NO EVENTOS SUELTOS
//
// C12 hablaba de eventos de inicio, fin y abandono. Guardados sueltos, despues
// hay que EMPAREJARLOS (que fin corresponde a que inicio), y ahi es donde se
// rompe. Un solo registro con las dos marcas guarda lo mismo sin el problema.
//
// QUE NO SE GUARDA: EL ESTADO
//
// `estado()` se calcula. Un pomodoro no "esta cumplido" porque alguien lo haya
// marcado: esta cumplido porque paso el tiempo. Eso hace que no haga falta
// ningun temporizador ni ningun proceso que limpie nada al arrancar: el estado
// es correcto lo mire quien lo mire y cuando lo mire.

import { horaEnZona } from "./config.ts";

/**
 * El estado de un pomodoro. NUNCA se guarda: se deriva con `estado()`.
 *
 *   en-curso  empezo y todavia no llego al final previsto
 *   cumplido  llego a su duracion (lo haya cerrado alguien o no)
 *   cortado   alguien lo cerro antes de que se cumpliera
 */
export type EstadoPomodoro = "en-curso" | "cumplido" | "cortado";

export const DURACION_POR_DEFECTO = 25;

const MILISEGUNDOS_POR_MINUTO = 60_000;

/** Un instante ISO 8601: con `Z` o con offset explicito, pero con hora. */
const FORMATO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface PomodoroJSON {
  id: string;
  /** La tarea en la que se estaba trabajando, o null si fue foco suelto. */
  tareaId: string | null;
  /**
   * Cuando empezo, como instante en UTC (`2026-10-14T23:47:00.000Z`).
   *
   * UTC y no hora local, porque un instante es un instante: asi se ordena y se
   * compara sin ambiguedad. Para mostrarlo se pasa por la zona (horaEnZona).
   */
  iniciadoEl: string;
  duracionMin: number;
  /** null mientras nadie lo haya cerrado. Si ya paso la duracion, da igual: el estado se deriva. */
  terminadoEl: string | null;
  nota: string;
}

export interface DatosNuevoPomodoro {
  tareaId?: string | null;
  duracionMin?: number;
  nota?: string;
}

export class Pomodoro {
  readonly id: string;
  readonly tareaId: string | null;
  readonly iniciadoEl: string;
  readonly duracionMin: number;
  terminadoEl: string | null;
  nota: string;

  constructor(datos: PomodoroJSON) {
    this.id = datos.id;
    this.tareaId = datos.tareaId;
    this.iniciadoEl = datos.iniciadoEl;
    this.duracionMin = datos.duracionMin;
    this.terminadoEl = datos.terminadoEl;
    this.nota = datos.nota;

    const problemas = this.validar();
    if (problemas.length > 0) {
      throw new Error(`Pomodoro invalido (${this.id || "sin id"}): ${problemas.join("; ")}`);
    }
  }

  /** Arranca uno. `ahora` entra por parametro para poder probarlo sin esperar. */
  static nuevo(datos: DatosNuevoPomodoro, id: string, ahora: Date): Pomodoro {
    return new Pomodoro({
      id,
      tareaId: datos.tareaId ?? null,
      iniciadoEl: ahora.toISOString(),
      duracionMin: datos.duracionMin ?? DURACION_POR_DEFECTO,
      terminadoEl: null,
      nota: datos.nota ?? "",
    });
  }

  static desdeJSON(dato: unknown): Pomodoro {
    if (typeof dato !== "object" || dato === null || Array.isArray(dato)) {
      throw new Error("un pomodoro guardado tiene que ser un objeto JSON");
    }
    return new Pomodoro(dato as PomodoroJSON);
  }

  aJSON(): PomodoroJSON {
    return {
      id: this.id,
      tareaId: this.tareaId,
      iniciadoEl: this.iniciadoEl,
      duracionMin: this.duracionMin,
      terminadoEl: this.terminadoEl,
      nota: this.nota,
    };
  }

  validar(): string[] {
    const problemas: string[] = [];

    if (typeof this.id !== "string" || this.id.trim() === "") {
      problemas.push("el id no puede estar vacio");
    }
    if (this.tareaId !== null && (typeof this.tareaId !== "string" || this.tareaId.trim() === "")) {
      problemas.push("tareaId tiene que ser null o un id no vacio");
    }
    if (typeof this.iniciadoEl !== "string" || !esInstanteValido(this.iniciadoEl)) {
      problemas.push("iniciadoEl tiene que ser un instante ISO 8601 con hora");
    }
    if (!Number.isInteger(this.duracionMin) || this.duracionMin <= 0) {
      problemas.push("duracionMin tiene que ser un entero mayor que 0");
    }
    if (this.terminadoEl !== null) {
      if (typeof this.terminadoEl !== "string" || !esInstanteValido(this.terminadoEl)) {
        problemas.push("terminadoEl tiene que ser null o un instante ISO 8601");
      } else if (esInstanteValido(this.iniciadoEl) && Date.parse(this.terminadoEl) < Date.parse(this.iniciadoEl)) {
        // La invariante que justifica que esto sea una clase y no un objeto suelto.
        problemas.push("terminadoEl no puede ser anterior a iniciadoEl");
      }
    }

    return problemas;
  }

  /** Cuando deberia terminar, segun cuando empezo y cuanto dura. */
  finPrevisto(): Date {
    return new Date(Date.parse(this.iniciadoEl) + this.duracionMin * MILISEGUNDOS_POR_MINUTO);
  }

  /**
   * El estado, DERIVADO del reloj. No se guarda en ningun lado.
   *
   * Es la pieza que hace que el pomodoro sobreviva a que la app este cerrada: no
   * hay nada que actualizar ni ningun aviso que esperar. Si paso el tiempo,
   * esta cumplido, y punto.
   */
  estado(ahora: Date): EstadoPomodoro {
    if (this.terminadoEl !== null) {
      return Date.parse(this.terminadoEl) >= this.finPrevisto().getTime() ? "cumplido" : "cortado";
    }
    return ahora.getTime() >= this.finPrevisto().getTime() ? "cumplido" : "en-curso";
  }

  /** Cuantos segundos faltan. Negativo si ya paso el fin previsto. */
  segundosRestantes(ahora: Date): number {
    return Math.round((this.finPrevisto().getTime() - ahora.getTime()) / 1000);
  }

  /**
   * Donde termina la linea de tiempo de este pomodoro.
   *
   * Tres casos, uno solo:
   *   - lo cerraron      -> la hora del cierre
   *   - paso su duracion -> el fin previsto (duro lo que tenia que durar)
   *   - sigue andando    -> ahora
   *
   * Existe para que el rango, los minutos y el total del bloque midan LO MISMO.
   * Antes cada uno lo calculaba por su lado y el resumen podia decir "25 min" en
   * la linea y sumar 0 en el total.
   */
  finEfectivo(ahora: Date): Date {
    if (this.terminadoEl !== null) return new Date(this.terminadoEl);
    return ahora.getTime() >= this.finPrevisto().getTime() ? this.finPrevisto() : ahora;
  }

  /** Cuanto duro de verdad, en minutos. Se corta en el fin previsto: un pomodoro de 25 minutos que quedo abierto toda la tarde duro 25, no cuatro horas. */
  duracionRealMin(ahora: Date): number {
    return Math.round((this.finEfectivo(ahora).getTime() - Date.parse(this.iniciadoEl)) / MILISEGUNDOS_POR_MINUTO);
  }

  /**
   * Lo cierra. Si ya habia terminado por reloj, se registra el fin previsto y
   * no la hora en que alguien se acordo de apretar el boton: lo que se guarda
   * es cuando termino el bloque, no cuando se hizo clic.
   */
  cerrar(ahora: Date): void {
    if (this.terminadoEl !== null) return;
    const fin = ahora.getTime() >= this.finPrevisto().getTime() ? this.finPrevisto() : ahora;
    this.terminadoEl = fin.toISOString();

    const problemas = this.validar();
    if (problemas.length > 0) {
      this.terminadoEl = null;
      throw new Error(`No se puede cerrar el pomodoro ${this.id}: ${problemas.join("; ")}`);
    }
  }

  /** Lo cerraron antes de que se cumpliera. */
  fueCortado(): boolean {
    return this.terminadoEl !== null && Date.parse(this.terminadoEl) < this.finPrevisto().getTime();
  }

  /**
   * La linea que ocupa en el tablero publicado, con las horas LOCALES.
   *
   * Este es el dato que `rendimiento` puede cruzar contra el horario: a que hora
   * empezo, a que hora termino y en que estaba.
   *
   * Todo sale de `finEfectivo`, asi que el rango, los minutos y el total del
   * bloque miden lo mismo. Y los que no estan cumplidos se marcan: un pomodoro
   * que va por el minuto 2 no puede figurar como un bloque de 25 minutos, porque
   * el agente leeria trabajo que todavia no existio.
   */
  resumenMarkdown(ahora: Date, tituloTarea?: string): string {
    const inicio = new Date(this.iniciadoEl);
    const fin = this.finEfectivo(ahora);
    const minutos = Math.round((fin.getTime() - inicio.getTime()) / MILISEGUNDOS_POR_MINUTO);
    const que = this.tareaId === null ? "sin tarea" : (tituloTarea ?? this.tareaId);

    const partes = [`${horaEnZona(inicio)}–${horaEnZona(fin)}`, `${minutos} min`];
    const estado = this.estado(ahora);
    if (estado !== "cumplido") partes.push(estado === "cortado" ? "cortado" : "en curso");
    partes.push(que);
    if (this.nota !== "") partes.push(this.nota);
    return `- ${partes.join(" · ")}`;
  }
}

/** Un instante ISO con hora, y ademas una fecha real (no `2026-13-45`). */
function esInstanteValido(valor: string): boolean {
  return FORMATO_INSTANTE.test(valor) && !Number.isNaN(Date.parse(valor));
}

/**
 * El bloque de pomodoros de un dia, para la vista derivada.
 *
 * `titulos` traduce un id de tarea a su titulo. Se pasa desde afuera para que
 * este modulo no tenga que saber como se guardan las tareas.
 */
export function proyectarPomodoros(
  pomodoros: Pomodoro[],
  fecha: string,
  titulos: Map<string, string>,
  ahora: Date,
): string {
  const delDia = pomodoros
    .filter((p) => {
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(p.iniciadoEl));
      return dia === fecha;
    })
    .sort((a, b) => Date.parse(a.iniciadoEl) - Date.parse(b.iniciadoEl));

  if (delDia.length === 0) return "";

  const lineas = ["## Pomodoros del día", ""];
  for (const p of delDia) {
    lineas.push(p.resumenMarkdown(ahora, p.tareaId === null ? undefined : titulos.get(p.tareaId)));
  }

  const minutos = delDia.reduce((total, p) => total + p.duracionRealMin(ahora), 0);
  lineas.push("", `Total: ${minutos} min en ${delDia.length} ${delDia.length === 1 ? "pomodoro" : "pomodoros"}.`, "");
  return lineas.join("\n");
}