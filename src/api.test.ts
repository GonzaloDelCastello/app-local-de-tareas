// Pruebas del contrato de la API. Se corren con:  npm.cmd test
//
// Llaman a manejarApi() directamente, sin levantar un servidor ni abrir un
// puerto. Asi se prueba el CONTRATO (rutas, codigos, formas) y no el socket:
// si estas fallan, el servidor no tiene nada que ver. El socket se verifica
// aparte, con curl.exe contra el puerto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crearAlmacenJSON } from "./almacen.ts";
import type { Almacen } from "./almacen.ts";
import { manejarApi } from "./api.ts";
import type { RespuestaApi } from "./api.ts";

const HOY = "2026-10-13";

type Llamar = (metodo: string, ruta: string, cuerpo?: unknown) => Promise<RespuestaApi | null>;

async function conApi(
  t: { after: (fn: () => void | Promise<void>) => void },
  prueba: (llamar: Llamar, almacen: Almacen) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "api-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
  const llamar: Llamar = async (metodo, ruta, cuerpo) =>
    await manejarApi(metodo, ruta, cuerpo === undefined ? "" : JSON.stringify(cuerpo), almacen, HOY);
  await prueba(llamar, almacen);
}

/** El cuerpo de la respuesta, como objeto. Falla con un mensaje util si no lo es. */
function cuerpo(r: RespuestaApi | null): Record<string, unknown> {
  assert.ok(r !== null, "la API tendria que haber respondido algo");
  assert.ok(typeof r.cuerpo === "object" && r.cuerpo !== null, "tendria que traer un objeto");
  return r.cuerpo as Record<string, unknown>;
}

/** Crea una tarea y devuelve su id, verificando el 201. */
async function crearUna(llamar: Llamar, titulo = "Una tarea"): Promise<string> {
  const r = await llamar("POST", "/api/tareas", { titulo });
  assert.equal(r?.codigo, 201, "crear tendria que dar 201");
  return cuerpo(r)["id"] as string;
}

test("una ruta que no es de la API devuelve null, para que el servidor siga con las suyas", async (t) => {
  await conApi(t, async (llamar) => {
    assert.equal(await llamar("GET", "/"), null);
    assert.equal(await llamar("GET", "/api/salud"), null);
    assert.equal(await llamar("GET", "/api/otracosa"), null);
  });
});

test("GET /api/tareas con el almacen vacio devuelve una lista vacia y el total", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("GET", "/api/tareas");
    assert.equal(r?.codigo, 200);
    assert.deepEqual(cuerpo(r)["tareas"], []);
    assert.equal(cuerpo(r)["total"], 0);
  });
});

test("POST crea la tarea, el id lo pone el servidor, y responde 201 con Location", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { titulo: "Pagar la tarjeta", venceEl: "2026-10-14" });

    assert.equal(r?.codigo, 201);
    assert.equal(r?.encabezados?.["Location"], "/api/tareas/t-0001");
    assert.equal(cuerpo(r)["id"], "t-0001");
    assert.equal(cuerpo(r)["estado"], "pendiente", "una tarea nueva nace pendiente");
    assert.equal(cuerpo(r)["creadaEl"], HOY);
    assert.equal(cuerpo(r)["cerradaEl"], null);
  });
});

test("POST sin titulo es 400, y el detalle dice cual es el problema", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { detalle: "sin titulo" });
    assert.equal(r?.codigo, 400);
    const detalles = cuerpo(r)["detalles"] as string[];
    assert.ok(detalles.some((d) => d.includes("titulo")), `el detalle tendria que nombrar el titulo: ${detalles.join(" | ")}`);
  });
});

test("POST no deja fijar el estado al crear: una tarea nace pendiente", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { titulo: "Ya hecha", estado: "hecha" });
    assert.equal(r?.codigo, 400);
    assert.ok((cuerpo(r)["detalles"] as string[]).some((d) => d.includes("estado")));
  });
});

test("POST no deja fijar el id: lo decide el almacen", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { titulo: "Intrusa", id: "t-9999" });
    assert.equal(r?.codigo, 400);
    assert.ok((cuerpo(r)["detalles"] as string[]).some((d) => d.includes("id")));
  });
});

test("POST con un balde que no existe es 400", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { titulo: "Con balde raro", balde: "Z" });
    assert.equal(r?.codigo, 400);
    assert.ok((cuerpo(r)["detalles"] as string[]).some((d) => d.includes("balde")));
  });
});

test("POST con una fecha con formato equivocado es 400", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("POST", "/api/tareas", { titulo: "Fecha mal", venceEl: "14/10/2026" });
    assert.equal(r?.codigo, 400);
    assert.ok((cuerpo(r)["detalles"] as string[]).some((d) => d.includes("venceEl")));
  });
});

test("POST con el cuerpo roto es 400 y no un 500", async (t) => {
  await conApi(t, async (llamar, almacen) => {
    const roto = await manejarApi("POST", "/api/tareas", "{ esto no es json", almacen, HOY);
    assert.equal(roto?.codigo, 400);
    assert.ok((cuerpo(roto)["detalles"] as string[]).some((d) => d.includes("JSON")));

    const vacio = await manejarApi("POST", "/api/tareas", "", almacen, HOY);
    assert.equal(vacio?.codigo, 400);
  });
});

test("GET de una tarea que no existe es 404", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("GET", "/api/tareas/t-9999");
    assert.equal(r?.codigo, 404);
    assert.match(String(cuerpo(r)["error"]), /t-9999/);
  });
});

test("PATCH cambia el titulo y deja la fecha de modificacion en hoy", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar, "Titulo viejo");
    const r = await llamar("PATCH", `/api/tareas/${id}`, { titulo: "Titulo nuevo" });

    assert.equal(r?.codigo, 200);
    assert.equal(cuerpo(r)["titulo"], "Titulo nuevo");
    assert.equal(cuerpo(r)["actualizadaEl"], HOY);
    assert.equal(cuerpo(r)["creadaEl"], HOY);
  });
});

test("PATCH a hecha completa la fecha de cierre, y volver a pendiente la borra", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar);

    const hecha = await llamar("PATCH", `/api/tareas/${id}`, { estado: "hecha" });
    assert.equal(hecha?.codigo, 200);
    assert.equal(cuerpo(hecha)["cerradaEl"], HOY, "cerrar tiene que completar la fecha de cierre");

    const vuelta = await llamar("PATCH", `/api/tareas/${id}`, { estado: "pendiente" });
    assert.equal(cuerpo(vuelta)["cerradaEl"], null, "reabrir tiene que borrarla");
  });
});

test("PATCH puede cambiar estado y orden de una sola vez", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar);
    const r = await llamar("PATCH", `/api/tareas/${id}`, { estado: "en-curso", orden: 3 });
    assert.equal(r?.codigo, 200);
    assert.equal(cuerpo(r)["estado"], "en-curso");
    assert.equal(cuerpo(r)["orden"], 3);
  });
});

test("PATCH con estado null es 400: el estado no admite 'sin valor'", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar);
    const r = await llamar("PATCH", `/api/tareas/${id}`, { estado: null });
    assert.equal(r?.codigo, 400);
    assert.ok((cuerpo(r)["detalles"] as string[]).some((d) => d.includes("estado")));
  });
});

test("PATCH con un estado que no existe es 400 y lo dice", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar);
    const r = await llamar("PATCH", `/api/tareas/${id}`, { estado: "terminada" });
    assert.equal(r?.codigo, 400);
    const detalles = (cuerpo(r)["detalles"] as string[]).join(" ");
    assert.match(detalles, /pendiente/);
  });
});

test("PATCH de una tarea que no existe es 404", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("PATCH", "/api/tareas/t-9999", { titulo: "Nada" });
    assert.equal(r?.codigo, 404);
  });
});

test("PATCH que dejaria la tarea invalida es 400 y no la guarda", async (t) => {
  await conApi(t, async (llamar, almacen) => {
    const id = await crearUna(llamar, "Titulo bueno");
    const r = await llamar("PATCH", `/api/tareas/${id}`, { titulo: "   " });

    assert.equal(r?.codigo, 400);
    const guardada = await almacen.buscar(id);
    assert.equal(guardada?.titulo, "Titulo bueno", "el cambio invalido no se puede haber guardado");
  });
});

test("DELETE responde 204, sin cuerpo, y despues la tarea no esta", async (t) => {
  await conApi(t, async (llamar) => {
    const id = await crearUna(llamar);

    const borrado = await llamar("DELETE", `/api/tareas/${id}`);
    assert.equal(borrado?.codigo, 204);
    assert.equal(borrado?.cuerpo, null);

    const despues = await llamar("GET", `/api/tareas/${id}`);
    assert.equal(despues?.codigo, 404);
  });
});

test("DELETE de algo que no existe es 404, no 204", async (t) => {
  await conApi(t, async (llamar) => {
    const r = await llamar("DELETE", "/api/tareas/t-9999");
    assert.equal(r?.codigo, 404);
  });
});

test("un metodo que no corresponde es 405, y dice cuales si sirven", async (t) => {
  await conApi(t, async (llamar) => {
    const enLaColeccion = await llamar("DELETE", "/api/tareas");
    assert.equal(enLaColeccion?.codigo, 405);
    assert.equal(enLaColeccion?.encabezados?.["Allow"], "GET, POST");

    const enUnaTarea = await llamar("POST", "/api/tareas/t-0001");
    assert.equal(enUnaTarea?.codigo, 405);
    assert.equal(enUnaTarea?.encabezados?.["Allow"], "GET, PATCH, DELETE");
  });
});

test("POST, PATCH y DELETE avisan que cambiaron los datos; GET no", async (t) => {
  await conApi(t, async (llamar) => {
    const creada = await llamar("POST", "/api/tareas", { titulo: "Una" });
    assert.equal(creada?.cambio, true);
    const id = cuerpo(creada)["id"] as string;

    const leida = await llamar("GET", "/api/tareas");
    assert.notEqual(leida?.cambio, true, "leer no cambia nada: no se regenera el tablero");

    const modificada = await llamar("PATCH", `/api/tareas/${id}`, { titulo: "Otra" });
    assert.equal(modificada?.cambio, true);

    const borrada = await llamar("DELETE", `/api/tareas/${id}`);
    assert.equal(borrada?.cambio, true);
  });
});

test("la lista devuelve todas las tareas creadas, con el total al dia", async (t) => {
  await conApi(t, async (llamar) => {
    await crearUna(llamar, "Primera");
    await crearUna(llamar, "Segunda");
    await crearUna(llamar, "Tercera");

    const r = await llamar("GET", "/api/tareas");
    assert.equal(cuerpo(r)["total"], 3);
    assert.equal((cuerpo(r)["tareas"] as unknown[]).length, 3);
  });
});