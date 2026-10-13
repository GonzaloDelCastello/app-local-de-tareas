// Pruebas del dominio. Se corren con:  npm.cmd test
//
// Nota: desde una sesion del agente hay que agregar
//   --experimental-test-isolation=none
// porque el runner de node --test lanza un subproceso y el sandbox de la sesion
// lo bloquea con EPERM. En tu terminal, sin sandbox, `npm.cmd test` alcanza.

import { test } from "node:test";
import assert from "node:assert/strict";

import { Tarea, proyectarTablero } from "./tarea.ts";

const HOY = "2026-10-13";

test("crear una tarea le pone los valores por defecto", () => {
  const t = Tarea.crear({ titulo: "Pagar la tarjeta" }, "t-0001", HOY);

  assert.equal(t.id, "t-0001");
  assert.equal(t.titulo, "Pagar la tarjeta");
  assert.equal(t.estado, "pendiente");
  assert.equal(t.cerradaEl, null);
  assert.equal(t.dependenciasExternas, false);
  assert.equal(t.impostergable, false);
  assert.deepEqual(t.etiquetas, []);
  assert.equal(t.creadaEl, HOY);
});

test("una tarea sin titulo no se puede crear", () => {
  assert.throws(() => Tarea.crear({ titulo: "   " }, "t-0002", HOY), /titulo no puede estar vacio/);
});

test("mover a hecha completa la fecha de cierre, y reabrir la borra", () => {
  const t = Tarea.crear({ titulo: "Pagar internet" }, "t-0003", HOY);

  t.moverA("hecha", 0, "2026-10-15");
  assert.equal(t.estado, "hecha");
  assert.equal(t.cerradaEl, "2026-10-15");
  assert.equal(t.actualizadaEl, "2026-10-15");

  t.moverA("en-curso", 0, "2026-10-16");
  assert.equal(t.estado, "en-curso");
  assert.equal(t.cerradaEl, null, "una tarea abierta no puede tener fecha de cierre");
});

test("una tarea vencida es la que tiene fecha pasada y sigue abierta", () => {
  const vencida = Tarea.crear({ titulo: "Vencida", venceEl: "2026-10-10" }, "t-0004", HOY);
  assert.equal(vencida.estaVencida(HOY), true);
  assert.equal(vencida.diasHastaVencer(HOY), -3);

  const futura = Tarea.crear({ titulo: "Futura", venceEl: "2026-10-20" }, "t-0005", HOY);
  assert.equal(futura.estaVencida(HOY), false);
  assert.equal(futura.diasHastaVencer(HOY), 7);

  const sinFecha = Tarea.crear({ titulo: "Sin fecha" }, "t-0006", HOY);
  assert.equal(sinFecha.estaVencida(HOY), false);
  assert.equal(sinFecha.diasHastaVencer(HOY), null);

  const cerrada = Tarea.crear({ titulo: "Cerrada", venceEl: "2026-10-10" }, "t-0007", HOY);
  cerrada.moverA("hecha", 0, HOY);
  assert.equal(cerrada.estaVencida(HOY), false, "una tarea cerrada ya no esta vencida");
});

test("aJSON y desdeJSON hacen el viaje de ida y vuelta", () => {
  const original = Tarea.crear(
    { titulo: "Con datos", venceEl: "2026-10-20", impostergable: true, balde: "A", dimension: "rendimiento" },
    "t-0008",
    HOY,
  );
  original.moverA("en-curso", 3, HOY);

  const texto = JSON.stringify(original.aJSON());
  const vuelta = Tarea.desdeJSON(JSON.parse(texto));

  assert.ok(vuelta instanceof Tarea, "desdeJSON tiene que devolver una Tarea, no un objeto plano");
  assert.deepEqual(vuelta.aJSON(), original.aJSON());
  assert.equal(vuelta.orden, 3);
});

test("desdeJSON rechaza lo que no es una tarea", () => {
  assert.throws(() => Tarea.desdeJSON("texto suelto"), /objeto JSON/);
  assert.throws(() => Tarea.desdeJSON([1, 2]), /objeto JSON/);
  assert.throws(() => Tarea.desdeJSON({ id: "t-0009", titulo: "" }), /titulo/);
});

test("resumenMarkdown arma la linea con el formato de la bandeja", () => {
  const t = Tarea.crear(
    { titulo: "Pagar la tarjeta", venceEl: "2026-10-14", impostergable: true, balde: "A" },
    "t-0010",
    HOY,
  );
  assert.equal(t.resumenMarkdown(), "- [ ] **Pagar la tarjeta** · `t-0010` · vence 2026-10-14 · **impostergable** · balde A");

  t.moverA("hecha", 0, HOY);
  assert.ok(t.resumenMarkdown().startsWith("- [x] "), "una tarea hecha se marca con [x]");
});

test("proyectarTablero agrupa por columna y respeta el orden", () => {
  const a = Tarea.crear({ titulo: "Segunda" }, "t-0011", HOY);
  const b = Tarea.crear({ titulo: "Primera" }, "t-0012", HOY);
  a.moverA("pendiente", 2, HOY);
  b.moverA("pendiente", 1, HOY);

  const tablero = proyectarTablero([a, b], HOY);

  assert.match(tablero, /## pendiente \(2\)/);
  assert.ok(tablero.indexOf("Primera") < tablero.indexOf("Segunda"), "orden 1 va antes que orden 2");
  assert.match(tablero, /## hecha \(0\)/);
  assert.match(tablero, /No editar a mano/);
});