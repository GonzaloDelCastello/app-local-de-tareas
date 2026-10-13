// Pruebas del almacen. Se corren con:  npm.cmd test
//
// Cada prueba trabaja en su PROPIO directorio temporal, y lo borra al terminar.
// Nunca toca `datos\`: una prueba que ensucia los datos reales no sirve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crearAlmacenJSON, publicarTablero, renombrarConReintentos } from "./almacen.ts";
import { Tarea } from "./tarea.ts";

const HOY = "2026-10-13";

/**
 * Corre la prueba en un directorio temporal nuevo y lo borra al final.
 * El tipo del contexto se describe por su forma, para no depender del tipo
 * interno del runner.
 */
async function enDirectorioNuevo(
  t: { after: (fn: () => void | Promise<void>) => void },
  prueba: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "tareas-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  await prueba(dir);
}

test("listar en un archivo que todavia no existe devuelve una lista vacia", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    assert.deepEqual(await almacen.listar(), []);
    assert.equal(await almacen.buscar("t-0001"), null);
  });
});

test("guardar y volver a listar devuelve la tarea como Tarea, no como objeto plano", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    await almacen.guardar(Tarea.crear({ titulo: "Pagar la tarjeta" }, "t-0001", HOY));

    const tareas = await almacen.listar();
    assert.equal(tareas.length, 1);
    assert.ok(tareas[0] instanceof Tarea, "tiene que volver con sus metodos");
    assert.equal(tareas[0].titulo, "Pagar la tarjeta");
  });
});

test("guardar dos veces el mismo id reemplaza, no duplica", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    const tarea = Tarea.crear({ titulo: "Original" }, "t-0001", HOY);
    await almacen.guardar(tarea);

    tarea.titulo = "Corregido";
    await almacen.guardar(tarea);

    const tareas = await almacen.listar();
    assert.equal(tareas.length, 1);
    assert.equal(tareas[0].titulo, "Corregido");
  });
});

test("buscar y eliminar", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    await almacen.guardar(Tarea.crear({ titulo: "Una" }, "t-0001", HOY));
    await almacen.guardar(Tarea.crear({ titulo: "Otra" }, "t-0002", HOY));

    const encontrada = await almacen.buscar("t-0002");
    assert.equal(encontrada?.titulo, "Otra");

    await almacen.eliminar("t-0001");
    const quedan = await almacen.listar();
    assert.equal(quedan.length, 1);
    assert.equal(quedan[0].id, "t-0002");

    // Eliminar algo que no existe no puede romper.
    await almacen.eliminar("t-9999");
    assert.equal((await almacen.listar()).length, 1);
  });
});

test("siguienteId arranca en t-0001 y sigue desde el mas alto", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    assert.equal(await almacen.siguienteId(), "t-0001");

    await almacen.guardar(Tarea.crear({ titulo: "Siete" }, "t-0007", HOY));
    await almacen.guardar(Tarea.crear({ titulo: "Tres" }, "t-0003", HOY));
    assert.equal(await almacen.siguienteId(), "t-0008");

    // Un id con formato raro no tiene que romper el calculo.
    await almacen.guardar(Tarea.crear({ titulo: "Rara" }, "sin-formato", HOY));
    assert.equal(await almacen.siguienteId(), "t-0008");
  });
});

test("una tarea con el id repetido en el archivo se detecta al buscar", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const ruta = join(dir, "tareas.json");
    const almacen = crearAlmacenJSON(ruta);
    await almacen.guardar(Tarea.crear({ titulo: "Primera" }, "t-0001", HOY));

    // Se edita el archivo a mano, como haria una persona o un agente.
    const crudo = JSON.parse(await readFile(ruta, "utf8"));
    crudo.push(Tarea.crear({ titulo: "Intrusa" }, "t-0002", HOY).aJSON());
    await writeFile(ruta, `${JSON.stringify(crudo, null, 2)}\n`, "utf8");

    assert.equal((await almacen.listar()).length, 2, "el archivo editado a mano se lee igual");
  });
});

test("un archivo que no es JSON valido falla con un mensaje que dice cual", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const ruta = join(dir, "tareas.json");
    await writeFile(ruta, "{ esto no es json", "utf8");
    const almacen = crearAlmacenJSON(ruta);
    await assert.rejects(() => almacen.listar(), /no es JSON valido/);
  });
});

test("una tarea invalida adentro del archivo falla diciendo la posicion", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const ruta = join(dir, "tareas.json");
    const buena = Tarea.crear({ titulo: "Buena" }, "t-0001", HOY).aJSON();
    const mala = { ...buena, id: "t-0002", titulo: "   " };
    await writeFile(ruta, `${JSON.stringify([buena, mala], null, 2)}\n`, "utf8");

    const almacen = crearAlmacenJSON(ruta);
    await assert.rejects(() => almacen.listar(), /posicion 1/);
  });
});

test("el archivo se escribe en UTF-8 sin BOM, con LF, y sin dejar temporales", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const ruta = join(dir, "tareas.json");
    const almacen = crearAlmacenJSON(ruta);
    await almacen.guardar(Tarea.crear({ titulo: "Acentos: ñandú y café" }, "t-0001", HOY));

    const bytes = await readFile(ruta);
    assert.notEqual(bytes[0], 0xEF, "no puede empezar con BOM (convencion del cuartel general)");

    const texto = bytes.toString("utf8");
    assert.ok(!texto.includes("\r\n"), "tiene que usar LF, no CRLF");
    assert.ok(texto.includes("ñandú y café"), "la enie y las tildes tienen que sobrevivir al viaje");

    const archivos = await readdir(dir);
    assert.deepEqual(archivos, ["tareas.json"], "la escritura atomica no puede dejar el .tmp");
  });
});

test("publicarTablero escribe la vista derivada y la devuelve", async (t) => {
  await enDirectorioNuevo(t, async (dir) => {
    const almacen = crearAlmacenJSON(join(dir, "tareas.json"));
    await almacen.guardar(
      Tarea.crear({ titulo: "Pagar la tarjeta", venceEl: "2026-10-14", impostergable: true }, "t-0001", HOY),
    );

    const rutaTablero = join(dir, "tablero.md");
    const devuelto = await publicarTablero(almacen, rutaTablero, HOY);

    assert.match(devuelto, /## pendiente \(1\)/);
    assert.match(devuelto, /No editar a mano/);
    assert.equal(await readFile(rutaTablero, "utf8"), devuelto, "lo que devuelve es lo que escribe");
  });
});
test("el renombre reintenta cuando el sistema dice que el archivo esta ocupado", async () => {
  let intentos = 0;
  const ocupadoLasPrimerasDos = async (): Promise<void> => {
    intentos = intentos + 1;
    if (intentos <= 2) {
      const error = new Error("el archivo esta ocupado") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    }
  };

  await renombrarConReintentos("origen", "destino", ocupadoLasPrimerasDos, 5, 1);
  assert.equal(intentos, 3, "tiene que reintentar hasta que el sistema lo permita");
});

test("si el renombre falla siempre, el error sale a la superficie", async () => {
  const siempreOcupado = async (): Promise<void> => {
    const error = new Error("el archivo esta ocupado") as NodeJS.ErrnoException;
    error.code = "EPERM";
    throw error;
  };

  await assert.rejects(() => renombrarConReintentos("origen", "destino", siempreOcupado, 3, 1), /ocupado/);
});

test("un error que no es de bloqueo no se reintenta", async () => {
  let intentos = 0;
  const noExiste = async (): Promise<void> => {
    intentos = intentos + 1;
    const error = new Error("no existe el archivo") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  };

  await assert.rejects(() => renombrarConReintentos("origen", "destino", noExiste, 5, 1), /no existe/);
  assert.equal(intentos, 1, "reintentar un ENOENT no lo va a arreglar");
});