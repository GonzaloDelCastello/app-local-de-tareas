// Pruebas de los endpoints de pomodoros.
//
// El reloj entra por parametro (`AHORA`): una prueba que espera 25 minutos no
// es una prueba. Y permite verificar la derivacion del estado moviendo el
// reloj, que es justo lo que no se puede hacer con un temporizador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crearAlmacenDePomodoros, crearAlmacenDeTareas } from "./almacen.ts";
import type { Almacen } from "./almacen.ts";
import { manejarApiPomodoros } from "./api-pomodoros.ts";
import type { RespuestaApi } from "./api-comun.ts";
import { Pomodoro } from "./pomodoro.ts";
import { Tarea } from "./tarea.ts";

const ARRANQUE = new Date("2026-10-14T12:00:00.000Z"); // 09:00 en Buenos Aires
const A_LOS_10 = new Date("2026-10-14T12:10:00.000Z");
const A_LOS_30 = new Date("2026-10-14T12:30:00.000Z");

type Llamar = (metodo: string, ruta: string, cuerpo?: unknown, ahora?: Date) => Promise<RespuestaApi | null>;

async function conApi(
  t: { after: (fn: () => void | Promise<void>) => void },
  prueba: (llamar: Llamar, pomodoros: Almacen<Pomodoro>, tareas: Almacen<Tarea>) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "pom-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const pomodoros = crearAlmacenDePomodoros(join(dir, "pomodoros.json"));
  const tareas = crearAlmacenDeTareas(join(dir, "tareas.json"));

  const llamar: Llamar = async (metodo, ruta, cuerpo, ahora = ARRANQUE) =>
    await manejarApiPomodoros(
      metodo,
      ruta,
      cuerpo === undefined ? "" : JSON.stringify(cuerpo),
      pomodoros,
      (id) => tareas.buscar(id),
      ahora,
    );

  await prueba(llamar, pomodoros, tareas);
}

function cuerpo(r: RespuestaApi | null): Record<string, unknown> {
  assert.ok(r !== null, "tendria que haber respondido");
  assert.ok(typeof r.cuerpo === "object" && r.cuerpo !== null, "tendria que traer un objeto");
  return r.cuerpo as Record<string, unknown>;
}

async function arrancarUno(llamar: Llamar, cuerpoPeticion: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const r = await llamar("POST", "/api/pomodoros", cuerpoPeticion);
  assert.equal(r?.codigo, 201, "arrancar tendria que dar 201");
  return cuerpo(r);
}

test("una ruta que no es de pomodoros devuelve null", async (t) => {
  await conApi(t, async (llamar) => {
    assert.equal(await llamar("GET", "/api/tareas"), null);
    assert.equal(await llamar("GET", "/api/pomodorosx"), null);
  });
});

test("POST arranca un pomodoro: 201, Location, y con el reloj ya andando", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/pomodoros", {});
    assert.equal(r?.codigo, 201);
    assert.equal(r?.encabezados?.["Location"], "/api/pomodoros/p-0001");

    const p = cuerpo(r);
    assert.equal(p["id"], "p-0001");
    assert.equal(p["estado"], "en-curso");
    assert.equal(p["duracionMin"], 25);
    assert.equal(p["terminadoEl"], null);
    assert.equal(p["segundosRestantes"], 1500, "25 minutos son 1500 segundos");
  });
});

test("la vista trae lo derivado: fin previsto, estado y lo que duro", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const aLos10 = cuerpo(await llamar("GET", "/api/pomodoros/en-curso", undefined, A_LOS_10));
    const p = aLos10["pomodoro"] as Record<string, unknown>;
    assert.equal(p["estado"], "en-curso");
    assert.equal(p["segundosRestantes"], 900);
    assert.equal(p["duracionRealMin"], 10);
    assert.equal(p["finPrevisto"], "2026-10-14T12:25:00.000Z", "25 minutos despues de las 12:00 UTC");
  });
});

test("a los 30 minutos el estado es CUMPLIDO, sin que nadie lo haya cerrado", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const p = cuerpo(await llamar("GET", "/api/pomodoros/p-0001", undefined, A_LOS_30));
    assert.equal(p["estado"], "cumplido");
    assert.equal(p["terminadoEl"], null, "nadie lo cerro: el estado se deriva del reloj");
    assert.equal(p["duracionRealMin"], 25, "y duro 25, no 30");
  });
});

test("a los 30 minutos YA NO esta en curso", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const r = await llamar("GET", "/api/pomodoros/en-curso", undefined, A_LOS_30);
    assert.equal(cuerpo(r)["pomodoro"], null, "un pomodoro cumplido y sin cerrar no es un reloj andando");
  });
});

test("no puede haber dos pomodoros a la vez: el segundo es 409, con el que corre", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const r = await llamar("POST", "/api/pomodoros", {}, A_LOS_10);
    assert.equal(r?.codigo, 409);
    const p = cuerpo(r)["pomodoro"] as Record<string, unknown>;
    assert.equal(p["id"], "p-0001", "devuelve el que ya estaba corriendo, para poder mostrarlo");
  });
});

test("cuando el primero se cumplio, si se puede arrancar otro", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const r = await llamar("POST", "/api/pomodoros", {}, A_LOS_30);
    assert.equal(r?.codigo, 201);
    assert.equal(cuerpo(r)["id"], "p-0002");
  });
});

test("POST con una tarea que no existe es 400", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/pomodoros", { tareaId: "t-9999" });
    assert.equal(r?.codigo, 400);
    assert.match((cuerpo(r)["detalles"] as string[]).join(" "), /no existe la tarea t-9999/);
  });
});

test("POST con una tarea que si existe la asocia", async (t) => {
  await conApi(t, async (llamar, _pomodoros, tareas) => {
    await tareas.guardar(Tarea.crear({ titulo: "Proyecto de sueldos" }, "t-0003", "2026-10-14"));

    const p = await arrancarUno(llamar, { tareaId: "t-0003" });
    assert.equal(p["tareaId"], "t-0003");
  });
});

test("POST no deja fijar el id ni el arranque", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/pomodoros", { id: "p-9999" });
    assert.equal(r?.codigo, 400);
    assert.match((cuerpo(r)["detalles"] as string[]).join(" "), /"id"/);
  });
});

test("POST con duracionMin en null es 400: un pomodoro dura algo", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/pomodoros", { duracionMin: null });
    assert.equal(r?.codigo, 400);
    assert.match((cuerpo(r)["detalles"] as string[]).join(" "), /duracionMin/);
  });
});

test("PATCH con estado terminado lo cierra, y es idempotente", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);

    const cerrado = await llamar("PATCH", "/api/pomodoros/p-0001", { estado: "terminado" }, A_LOS_10);
    assert.equal(cerrado?.codigo, 200);
    const p = cuerpo(cerrado);
    assert.equal(p["estado"], "cortado", "lo cerraron a los 10 de 25 minutos");
    assert.equal(p["duracionRealMin"], 10);

    const otraVez = await llamar("PATCH", "/api/pomodoros/p-0001", { estado: "terminado" }, A_LOS_30);
    assert.equal(cuerpo(otraVez)["terminadoEl"], p["terminadoEl"], "cerrarlo de nuevo no cambia nada");
  });
});

test("PATCH con otro estado es 400: un pomodoro no se reabre", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);
    const r = await llamar("PATCH", "/api/pomodoros/p-0001", { estado: "en-curso" });
    assert.equal(r?.codigo, 400);
    assert.match((cuerpo(r)["detalles"] as string[]).join(" "), /terminado/);
  });
});

test("PATCH de un pomodoro que no existe es 404", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("PATCH", "/api/pomodoros/p-9999", { estado: "terminado" });
    assert.equal(r?.codigo, 404);
  });
});

test("GET de la lista trae todos, con el mas reciente primero", async (t) => {
  await conApi(t, async (llamar) => {
    await arrancarUno(llamar);
    await llamar("POST", "/api/pomodoros", {}, A_LOS_30);

    const r = await llamar("GET", "/api/pomodoros", undefined, A_LOS_30);
    assert.equal(cuerpo(r)["total"], 2);
    const lista = cuerpo(r)["pomodoros"] as Array<Record<string, unknown>>;
    assert.equal(lista[0]?.["id"], "p-0002", "el mas reciente va primero");
  });
});

test("un metodo que no corresponde es 405, y dice cuales si sirven", async (t) => {
  await conApi(t, async (llamar) => {
    const enLaColeccion = await llamar("DELETE", "/api/pomodoros");
    assert.equal(enLaColeccion?.codigo, 405);
    assert.equal(enLaColeccion?.encabezados?.["Allow"], "GET, POST");

    const enUno = await llamar("POST", "/api/pomodoros/p-0001");
    assert.equal(enUno?.codigo, 405);
    assert.equal(enUno?.encabezados?.["Allow"], "GET, PATCH");
  });
});

test("POST sobre en-curso es 405: en-curso es una ruta, no un pomodoro", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/pomodoros/en-curso");
    assert.equal(r?.codigo, 405);
  });
});

test("POST, PATCH avisan que cambiaron los datos; GET no", async (t) => {
  await conApi(t, async (llamar) => {
    const creado = await llamar("POST", "/api/pomodoros", {});
    assert.equal(creado?.cambio, true);

    const leido = await llamar("GET", "/api/pomodoros");
    assert.notEqual(leido?.cambio, true);

    const cerrado = await llamar("PATCH", "/api/pomodoros/p-0001", { estado: "terminado" });
    assert.equal(cerrado?.cambio, true);
  });
});