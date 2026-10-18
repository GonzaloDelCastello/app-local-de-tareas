// Pruebas del exporte para los agentes.
//
// El reloj entra por parametro: una prueba que depende de la hora no se puede
// repetir, y este modulo exporta horas.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SCHEMA_VERSION, construirExporte } from "./exporte.ts";
import { Pomodoro } from "./pomodoro.ts";
import { Tarea } from "./tarea.ts";

const INICIO = new Date("2026-10-14T12:00:00.000Z");   // 09:00 en Buenos Aires
const A_LOS_30 = new Date("2026-10-14T12:30:00.000Z"); // paso el fin previsto de 25

test("un exporte sin tareas tiene la version y la lista vacia", () => {
  const e = construirExporte([], [], INICIO);

  assert.equal(e.schema_version, SCHEMA_VERSION);
  assert.deepEqual(e.tareas, []);
  assert.equal(e.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(e.generated_at, INICIO.toISOString());
});

test("las tres imprecisiones conocidas estan escritas en el archivo", () => {
  const e = construirExporte([], [], INICIO);

  assert.equal(e.notas.length, 3, "quien lo lea no tiene que descubrirlas por sorpresa");
  assert.ok(e.notas.some((n) => n.includes("precision de DIA")));
  assert.ok(e.notas.some((n) => n.includes("no son uuid")));
  assert.ok(e.notas.some((n) => n.includes("estimated_pomodoros")));
});

test("una tarea se exporta con los nombres del esquema pedido", () => {
  const tarea = Tarea.crear(
    { titulo: "Proyecto de sueldos", dimension: "desarrollo", balde: "B", etiquetas: ["proyecto"] },
    "t-0003",
    "2026-10-17",
  );

  const [exportada] = construirExporte([tarea], [], INICIO).tareas;

  assert.equal(exportada?.id, "t-0003");
  assert.equal(exportada?.title, "Proyecto de sueldos");
  assert.equal(exportada?.project, "desarrollo", "la app lo llama dimension");
  assert.equal(exportada?.context, "balde-B", "la app lo llama balde");
  assert.deepEqual(exportada?.tags, ["proyecto"]);
  assert.equal(exportada?.created_at, "2026-10-17T00:00:00-03:00", "medianoche local");
});

test("los cuatro estados se traducen a los del pedido", () => {
  const hacer = (estado: string, id: string) => {
    const t = Tarea.crear({ titulo: "x" }, id, "2026-10-17");
    if (estado !== "pendiente") t.moverA(estado as never, 0, "2026-10-17");
    return t;
  };

  const estados = ["pendiente", "en-curso", "hecha", "descartada"];
  const tareas = estados.map((e, i) => hacer(e, `t-000${i + 1}`));
  const exportadas = construirExporte(tareas, [], INICIO).tareas;

  assert.deepEqual(
    exportadas.map((t) => t.status),
    ["pending", "in_progress", "done", "cancelled"],
  );
});

test("una tarea sin clasificar no queda con project vacio: el campo es obligatorio", () => {
  const tarea = Tarea.crear({ titulo: "suelta" }, "t-0009", "2026-10-17");
  const [exportada] = construirExporte([tarea], [], INICIO).tareas;

  assert.equal(exportada?.project, "sin-clasificar");
  assert.equal(exportada?.context, "sin-clasificar");
});

test("completed_at se completa solo cuando la tarea se cerro", () => {
  const abierta = Tarea.crear({ titulo: "abierta" }, "t-0004", "2026-10-17");
  const cerrada = Tarea.crear({ titulo: "cerrada" }, "t-0005", "2026-10-17");
  cerrada.moverA("hecha", 0, "2026-10-18");

  const exportadas = construirExporte([abierta, cerrada], [], INICIO).tareas;
  const porId = (id: string) => exportadas.find((t) => t.id === id);

  assert.equal(porId("t-0004")?.completed_at, null);
  assert.equal(porId("t-0005")?.completed_at, "2026-10-18T00:00:00-03:00");
});

test("estimated_pomodoros se deriva de los minutos, redondeando para arriba", () => {
  const hacer = (min: number | null, id: string) =>
    Tarea.crear(min === null ? { titulo: "x" } : { titulo: "x", estimacionMin: min }, id, "2026-10-17");

  const exportadas = construirExporte([hacer(60, "t-0006"), hacer(30, "t-0007"), hacer(null, "t-0008")], [], INICIO).tareas;
  const porId = (id: string) => exportadas.find((t) => t.id === id);

  assert.equal(porId("t-0006")?.estimated_pomodoros, 3, "60 minutos son 3 pomodoros de 25? 2.4 -> 3");
  assert.equal(porId("t-0007")?.estimated_pomodoros, 2, "30 minutos -> 2");
  assert.equal(porId("t-0008")?.estimated_pomodoros, null);
});

test("los pomodoros se asocian a su tarea y traen la duracion en segundos", () => {
  const tarea = Tarea.crear({ titulo: "con pomodoro" }, "t-0001", "2026-10-14");
  const otro = Pomodoro.nuevo({}, "p-0002", INICIO);           // sin tarea
  const suyo = Pomodoro.nuevo({ tareaId: "t-0001" }, "p-0001", INICIO);

  const [exportada] = construirExporte([tarea], [otro, suyo], A_LOS_30).tareas;

  assert.equal(exportada?.pomodoros.length, 1, "solo el de la tarea");
  const [p] = exportada?.pomodoros ?? [];
  assert.equal(p?.started_at, INICIO.toISOString());
  assert.equal(p?.duration_seconds, 1500, "los 25 minutos previstos, no los 30 que pasaron");
  assert.equal(p?.ended_at, "2026-10-14T12:25:00.000Z");
});

test("un pomodoro que todavia corre se exporta con lo que lleva", () => {
  const tarea = Tarea.crear({ titulo: "en curso" }, "t-0002", "2026-10-14");
  const corriendo = Pomodoro.nuevo({ tareaId: "t-0002" }, "p-0003", INICIO);
  const aLos10 = new Date("2026-10-14T12:10:00.000Z");

  const [exportada] = construirExporte([tarea], [corriendo], aLos10).tareas;
  const [p] = exportada?.pomodoros ?? [];

  assert.equal(p?.duration_seconds, 600, "10 minutos, no 25");
});

test("los pomodoros de una tarea salen en orden cronologico", () => {
  const tarea = Tarea.crear({ titulo: "varios" }, "t-0005", "2026-10-14");
  const tarde = Pomodoro.nuevo({ tareaId: "t-0005" }, "p-0002", new Date("2026-10-14T15:00:00.000Z"));
  const temprano = Pomodoro.nuevo({ tareaId: "t-0005" }, "p-0001", INICIO);

  const [exportada] = construirExporte([tarea], [tarde, temprano], A_LOS_30).tareas;

  assert.equal(exportada?.pomodoros.length, 2);
  assert.ok(exportada!.pomodoros[0]!.started_at < exportada!.pomodoros[1]!.started_at);
});