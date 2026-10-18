// El exporte para los agentes (C24).
//
// QUE ES
//
// Una PROYECCION de los datos de la app al formato que `rendimiento` pidio para
// usarlos como materia prima de analisis. No es una segunda fuente de verdad:
// los datos viven en tareas.json y pomodoros.json, esto se regenera entero cada
// vez y no se edita a mano. Igual que el tablero.md, pero en JSON y con otro
// esquema.
//
// POR QUE UN ARCHIVO APARTE Y NO EL tablero.md
//
// El markdown es para leer; un JSON con esquema estable es para analizar. El
// agente tiene que poder recorrer las tareas y sus pomodoros sin parsear prosa.
//
// LOS TRES LUGARES DONDE ESTE ESQUEMA NO ES EXACTO, y que estan anotados en el
// propio archivo para que nadie los descubra por sorpresa:
//
//   1. Las fechas de las TAREAS tienen precision de DIA, no de segundo. La app
//      guarda `2026-10-17`, asi que se exportan como medianoche local. Un
//      `created_at` de las 00:00 no significa que se creo a esa hora.
//   2. El `id` no es un uuid: es `t-0007`, estable y unico, pero no uuid.
//   3. `estimated_pomodoros` se deriva de los minutos estimados, porque la app
//      estima en minutos y no en pomodoros.
//
// Los POMODOROS, en cambio, si tienen precision de segundo: su `started_at` y
// `ended_at` son instantes reales.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Almacen } from "./almacen.ts";
import { DURACION_POR_DEFECTO, Pomodoro } from "./pomodoro.ts";
import { ZONA } from "./config.ts";
import type { Tarea } from "./tarea.ts";
import type { Estado } from "./tipos.ts";

/** Sube SOLO si el esquema cambia de forma incompatible. */
export const SCHEMA_VERSION = 1;

/**
 * Buenos Aires es UTC-3 todo el año: desde 2009 no hay horario de verano.
 * Si algun dia vuelve, esto hay que cambiarlo por un calculo con la zona.
 */
const OFFSET_LOCAL = "-03:00";

/** Los estados del pedido, que no se llaman igual que los de la app. */
export type EstadoExporte = "pending" | "in_progress" | "done" | "cancelled";

const ESTADO_A_STATUS: Record<Estado, EstadoExporte> = {
  pendiente: "pending",
  "en-curso": "in_progress",
  hecha: "done",
  descartada: "cancelled",
};

export interface PomodoroExporte {
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

export interface TareaExporte {
  id: string;
  title: string;
  /** De donde es la tarea: la app lo llama `dimension`. */
  project: string;
  /** Que clase de recurso consume: la app lo llama `balde`. */
  context: string;
  status: EstadoExporte;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  estimated_pomodoros: number | null;
  tags: string[];
  pomodoros: PomodoroExporte[];
}

export interface ExporteTareas {
  schema_version: number;
  generated_at: string;
  timezone: string;
  /**
   * Las tres imprecisiones conocidas, escritas EN EL ARCHIVO para que quien lo
   * lea no las descubra por sorpresa.
   */
  notas: string[];
  tareas: TareaExporte[];
}

/**
 * "2026-10-17" -> "2026-10-17T00:00:00-03:00".
 *
 * Medianoche local, y no una hora inventada a partir de nada: es lo mas honesto
 * que se puede escribir cuando el dato original tiene precision de dia.
 */
function fechaAIso(fecha: string): string {
  return `${fecha}T00:00:00${OFFSET_LOCAL}`;
}

function estimacionEnPomodoros(minutos: number | null): number | null {
  if (minutos === null) return null;
  return Math.ceil(minutos / DURACION_POR_DEFECTO);
}

function pomodoroExporte(pomodoro: Pomodoro, ahora: Date): PomodoroExporte {
  const inicio = new Date(pomodoro.iniciadoEl);
  // `finEfectivo` es el mismo que usa el tablero: el cierre, el fin previsto o
  // ahora. Asi el exporte y el markdown no pueden decir cosas distintas.
  const fin = pomodoro.finEfectivo(ahora);
  return {
    started_at: inicio.toISOString(),
    ended_at: fin.toISOString(),
    duration_seconds: Math.round((fin.getTime() - inicio.getTime()) / 1000),
  };
}

function tareaExporte(tarea: Tarea, pomodoros: Pomodoro[], ahora: Date): TareaExporte {
  return {
    id: tarea.id,
    title: tarea.titulo,
    project: tarea.dimension ?? "sin-clasificar",
    context: tarea.balde === null ? "sin-clasificar" : `balde-${tarea.balde}`,
    status: ESTADO_A_STATUS[tarea.estado],
    created_at: fechaAIso(tarea.creadaEl),
    completed_at: tarea.cerradaEl === null ? null : fechaAIso(tarea.cerradaEl),
    updated_at: fechaAIso(tarea.actualizadaEl),
    estimated_pomodoros: estimacionEnPomodoros(tarea.estimacionMin),
    tags: [...tarea.etiquetas],
    pomodoros: pomodoros
      .filter((p) => p.tareaId === tarea.id)
      .sort((a, b) => Date.parse(a.iniciadoEl) - Date.parse(b.iniciadoEl))
      .map((p) => pomodoroExporte(p, ahora)),
  };
}

/**
 * Arma el objeto exportable. Funcion pura: entra el estado, sale el JSON.
 *
 * Es pura a proposito: asi se puede probar con un `ahora` fijo y sin disco.
 */
export function construirExporte(tareas: Tarea[], pomodoros: Pomodoro[], ahora: Date): ExporteTareas {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: ahora.toISOString(),
    timezone: ZONA,
    notas: [
      "created_at, updated_at y completed_at tienen precision de DIA: se exportan a medianoche local. La app guarda la fecha, no la hora.",
      "Los id son estables y unicos pero no son uuid.",
      "estimated_pomodoros se deriva de una estimacion en minutos, redondeando para arriba.",
    ],
    tareas: tareas
      .map((t) => tareaExporte(t, pomodoros, ahora))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  };
}

/**
 * Escribe el exporte. Se llama en cada cambio (el servidor lo hace) y tambien
 * se puede correr a mano:
 *
 *   node src/demo-exporte.ts
 */
export async function publicarExporte(
  almacenTareas: Almacen<Tarea>,
  almacenPomodoros: Almacen<Pomodoro>,
  rutaArchivo: string,
  ahora: Date,
): Promise<ExporteTareas> {
  const exporte = construirExporte(
    await almacenTareas.listar(),
    await almacenPomodoros.listar(),
    ahora,
  );

  await mkdir(dirname(rutaArchivo), { recursive: true });
  await writeFile(rutaArchivo, `${JSON.stringify(exporte, null, 2)}\n`, "utf8");
  return exporte;
}