// Pruebas del pomodoro. Se corren con:  npm.cmd test
//
// Todo lo que depende del reloj entra por parametro (`ahora`). Una prueba que
// espera 25 minutos no es una prueba.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fechaEnZona, horaEnZona } from "./config.ts";
import { DURACION_POR_DEFECTO, Pomodoro, proyectarPomodoros } from "./pomodoro.ts";

const INICIO = new Date("2026-10-14T12:00:00.000Z");         // 09:00 en Buenos Aires
const A_LOS_10 = new Date("2026-10-14T12:10:00.000Z");       // 09:10
const A_LOS_30 = new Date("2026-10-14T12:30:00.000Z");       // 09:30
const A_LOS_40 = new Date("2026-10-14T12:40:00.000Z");       // 09:40

test("un pomodoro nuevo arranca en curso, con la duracion por defecto", () => {
  const p = Pomodoro.nuevo({}, "p-0001", INICIO);

  assert.equal(p.id, "p-0001");
  assert.equal(p.tareaId, null);
  assert.equal(p.duracionMin, DURACION_POR_DEFECTO);
  assert.equal(p.terminadoEl, null);
  assert.equal(p.estado(INICIO), "en-curso");
});

test("no se puede crear con una duracion que no sea entero positivo", () => {
  assert.throws(() => Pomodoro.nuevo({ duracionMin: 0 }, "p-0002", INICIO), /duracionMin/);
  assert.throws(() => Pomodoro.nuevo({ duracionMin: -5 }, "p-0003", INICIO), /duracionMin/);
  assert.throws(() => Pomodoro.nuevo({ duracionMin: 2.5 }, "p-0004", INICIO), /duracionMin/);
});

test("el estado se DERIVA del reloj: no hace falta cerrarlo para que se cumpla", () => {
  const p = Pomodoro.nuevo({}, "p-0005", INICIO);

  // Nadie lo cerro. Igual, a los 30 minutos esta cumplido: esa es la pieza que
  // hace que el pomodoro sobreviva a que la app este cerrada.
  assert.equal(p.terminadoEl, null, "nadie lo cerro");
  assert.equal(p.estado(INICIO), "en-curso");
  assert.equal(p.estado(A_LOS_10), "en-curso");
  assert.equal(p.estado(A_LOS_30), "cumplido");
  assert.equal(p.estado(A_LOS_40), "cumplido");
});

test("segundosRestantes cuenta para atras y se pone negativo al pasar", () => {
  const p = Pomodoro.nuevo({}, "p-0006", INICIO);

  assert.equal(p.segundosRestantes(INICIO), 1500);
  assert.equal(p.segundosRestantes(A_LOS_10), 900);
  assert.equal(p.segundosRestantes(A_LOS_30), -300);
});

test("cerrarlo antes del fin lo deja CORTADO, con la hora real", () => {
  const p = Pomodoro.nuevo({}, "p-0007", INICIO);
  p.cerrar(A_LOS_10);

  assert.equal(p.terminadoEl, A_LOS_10.toISOString());
  assert.equal(p.estado(A_LOS_10), "cortado");
  assert.equal(p.duracionRealMin(A_LOS_10), 10, "duro 10 minutos, no 25");
});

test("cerrarlo despues del fin lo deja CUMPLIDO, y guarda el fin previsto, no la hora del clic", () => {
  const p = Pomodoro.nuevo({}, "p-0008", INICIO);
  p.cerrar(A_LOS_40);

  assert.equal(p.estado(A_LOS_40), "cumplido");
  assert.equal(
    p.terminadoEl,
    p.finPrevisto().toISOString(),
    "se guarda cuando termino el bloque, no cuando alguien se acordo de apretar el boton",
  );
  assert.equal(p.duracionRealMin(A_LOS_40), 25);
});

test("cerrarlo dos veces no cambia nada", () => {
  const p = Pomodoro.nuevo({}, "p-0009", INICIO);
  p.cerrar(A_LOS_10);
  const primeraVez = p.terminadoEl;

  p.cerrar(A_LOS_30);
  assert.equal(p.terminadoEl, primeraVez);
});

test("un pomodoro que quedo abierto toda la tarde duro 25 minutos, no cuatro horas", () => {
  const p = Pomodoro.nuevo({}, "p-0010", INICIO);
  const tarde = new Date("2026-10-14T20:00:00.000Z");

  assert.equal(p.estado(tarde), "cumplido");
  assert.equal(p.duracionRealMin(tarde), 25);
});

test("aJSON y desdeJSON hacen el viaje de ida y vuelta", () => {
  const original = Pomodoro.nuevo({ tareaId: "t-0003", duracionMin: 50, nota: "sin interrupciones" }, "p-0011", INICIO);
  original.cerrar(A_LOS_40);

  const vuelta = Pomodoro.desdeJSON(JSON.parse(JSON.stringify(original.aJSON())));

  assert.ok(vuelta instanceof Pomodoro, "tiene que volver con sus metodos");
  assert.deepEqual(vuelta.aJSON(), original.aJSON());
});

test("desdeJSON rechaza lo que no es un pomodoro", () => {
  assert.throws(() => Pomodoro.desdeJSON("texto"), /objeto JSON/);
  assert.throws(() => Pomodoro.desdeJSON({ id: "p-0012" }), /iniciadoEl/);
  assert.throws(
    () => Pomodoro.desdeJSON({ id: "p-0013", tareaId: null, iniciadoEl: "2026-10-14", duracionMin: 25, terminadoEl: null, nota: "" }),
    /iniciadoEl/,
    "una fecha sin hora no alcanza para un instante",
  );
});

test("terminar antes de empezar es invalido", () => {
  assert.throws(
    () =>
      Pomodoro.desdeJSON({
        id: "p-0014",
        tareaId: null,
        iniciadoEl: A_LOS_30.toISOString(),
        duracionMin: 25,
        terminadoEl: INICIO.toISOString(),
        nota: "",
      }),
    /anterior a iniciadoEl/,
  );
});

test("un pomodoro de las 23:50 pertenece al dia local, no al dia UTC", () => {
  // 23:50 del 14 en Buenos Aires es, en UTC, la 02:50 del 15.
  const instante = new Date("2026-10-15T02:50:00.000Z");

  assert.equal(fechaEnZona(instante), "2026-10-14", "el dia local es el 14");
  assert.equal(instante.toISOString().slice(0, 10), "2026-10-15", "y el dia UTC es el 15: no es lo mismo");
  assert.equal(horaEnZona(instante), "23:50");

  const p = Pomodoro.nuevo({}, "p-0015", instante);
  const titulos = new Map<string, string>();
  const bloque = proyectarPomodoros([p], "2026-10-14", titulos, instante);

  assert.match(bloque, /23:50/, "aparece en el resumen del 14");
  assert.equal(proyectarPomodoros([p], "2026-10-15", titulos, instante), "", "y no en el del 15");
});

test("proyectarPomodoros ordena por hora, traduce el titulo y suma los minutos", () => {
  const temprano = Pomodoro.nuevo({ tareaId: "t-0003" }, "p-0016", INICIO);
  const tarde = Pomodoro.nuevo({}, "p-0017", A_LOS_40);
  temprano.cerrar(A_LOS_30);
  // A "tarde" hay que cerrarlo en su fin previsto: cerrarlo en el mismo
  // instante en que empezo daria 0 minutos, que es lo correcto y no lo que
  // esta prueba quiere medir.
  tarde.cerrar(tarde.finPrevisto());

  const titulos = new Map([["t-0003", "Proyecto de sueldos docentes"]]);
  const bloque = proyectarPomodoros([tarde, temprano], "2026-10-14", titulos, A_LOS_40);

  assert.ok(bloque.indexOf("09:00") < bloque.indexOf("09:40"), "el de las 09:00 va primero");
  assert.match(bloque, /Proyecto de sueldos docentes/);
  assert.match(bloque, /sin tarea/);
  assert.match(bloque, /Total: 50 min en 2 pomodoros/);
});

test("sin pomodoros del dia, el bloque no se escribe", () => {
  assert.equal(proyectarPomodoros([], "2026-10-14", new Map(), INICIO), "");
});

test("un pomodoro cortado se muestra con lo que duro de verdad, y marcado", () => {
  const p = Pomodoro.nuevo({ tareaId: "t-0003" }, "p-0018", INICIO);
  p.cerrar(A_LOS_10);

  const linea = p.resumenMarkdown(A_LOS_10, "Proyecto de sueldos docentes");

  assert.match(linea, /09:00–09:10/, "el rango real, no el previsto");
  assert.match(linea, /10 min/, "los minutos que duro, no los 25 previstos");
  assert.match(linea, /cortado/, "y tiene que decirlo");
  assert.doesNotMatch(linea, /25 min/);
});

test("un pomodoro que todavia corre se muestra con lo que lleva, marcado en curso", () => {
  const p = Pomodoro.nuevo({}, "p-0019", INICIO);

  const aLos10 = p.resumenMarkdown(A_LOS_10);
  assert.match(aLos10, /09:00–09:10/, "el rango hasta ahora");
  assert.match(aLos10, /10 min/, "los que lleva, no los 25 previstos");
  assert.match(aLos10, /en curso/);
  assert.doesNotMatch(aLos10, /25 min/, "no puede adelantar trabajo que no existe");

  const cumplido = p.resumenMarkdown(A_LOS_40);
  assert.match(cumplido, /09:00–09:25/, "al cumplirse, el rango es el previsto");
  assert.match(cumplido, /25 min/);
  assert.doesNotMatch(cumplido, /en curso/, "y ya no esta en curso");
});