// Servidor HTTP.
//
// Hace tres cosas y ninguna mas:
//   1. HTTP: leer la peticion, leer el cuerpo, escribir la respuesta.
//   2. Servir el HTML de la interfaz.
//   3. Traducir lo que devuelve la API (src/api.ts) a codigos HTTP.
//
// Las REGLAS del tablero no estan aca: estan en api.ts. Y las del dominio, en
// tarea.ts. Este archivo es el unico que sabe de sockets, y deberia seguir
// siendo el unico.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { crearAlmacenDePomodoros, crearAlmacenDeTareas, publicarTablero } from "./almacen.ts";
import { manejarApi } from "./api.ts";
import { manejarApiPomodoros } from "./api-pomodoros.ts";
// La configuracion sale de config.ts y no esta repetida aca: un solo lugar
// donde mirar cuando algo cambia de valor (decision C11).
import { ARCHIVO_POMODOROS, ARCHIVO_TABLERO, ARCHIVO_TAREAS, DIRECCION, PUERTO, RAIZ_PROYECTO, hoy } from "./config.ts";

const RAIZ_PUBLICA = join(RAIZ_PROYECTO, "publico");

/**
 * Los tipos de archivo que el servidor sabe entregar, por extension.
 *
 * Es una lista blanca: una extension que no este aca no se sirve, aunque el
 * archivo exista. Asi un `.ts`, un `.json` o un `.md` que queden dentro de
 * `publico/` por descuido no se publican solos.
 */
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/** La raiz publica ya resuelta, para poder comparar rutas absolutas. */
const RAIZ_PUBLICA_ABSOLUTA = resolve(RAIZ_PUBLICA);

/**
 * Tope para el cuerpo de una peticion.
 *
 * Sin tope, cualquiera que pueda abrir una conexion (y en esta app es solo este
 * equipo, pero igual) puede mandar un cuerpo enorme y consumir toda la memoria
 * del proceso. Una tarea no llega ni cerca de 100 KB.
 */
const LIMITE_CUERPO_BYTES = 100_000;

/** Un almacen por cosa guardada, creados al arrancar. */
const almacen = crearAlmacenDeTareas(ARCHIVO_TAREAS);
const almacenPomodoros = crearAlmacenDePomodoros(ARCHIVO_POMODOROS);

// `datos: unknown` y no `any`: quien llama puede pasar cualquier cosa, y
// JSON.stringify acepta cualquier cosa. `unknown` obliga a pensarlo; `any` lo
// esconde.
function responderJson(
  res: ServerResponse,
  codigo: number,
  datos: unknown,
  encabezados: Record<string, string> = {},
): void {
  // 204 es "salio bien y no hay nada que contar": no lleva cuerpo, ni siquiera
  // un `null`. Mandarlo seria una violacion del protocolo.
  if (codigo === 204 || datos === null) {
    res.writeHead(codigo, encabezados);
    res.end();
    return;
  }

  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    ...encabezados,
    // charset=utf-8 para que los acentos no salgan rotos.
    "Content-Type": "application/json; charset=utf-8",
    // byteLength y no cuerpo.length: un acento ocupa mas de un byte.
    "Content-Length": Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

/**
 * Junta el cuerpo de la peticion.
 *
 * Llega en pedazos (streaming) y no de una sola vez: hay que acumularlos. Si se
 * pasa del tope, se corta.
 */
async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const partes: Buffer[] = [];
  let total = 0;

  for await (const parte of req) {
    const trozo = parte as Buffer;
    total += trozo.length;
    if (total > LIMITE_CUERPO_BYTES) {
      throw new Error(`el cuerpo pasa el limite de ${LIMITE_CUERPO_BYTES} bytes`);
    }
    partes.push(trozo);
  }

  return Buffer.concat(partes).toString("utf8");
}

async function servirArchivo(
  res: ServerResponse,
  rutaAbsoluta: string,
  tipoContenido: string,
): Promise<void> {
  try {
    const contenido = await readFile(rutaAbsoluta);
    res.writeHead(200, {
      "Content-Type": tipoContenido,
      "Content-Length": contenido.length,
    });
    res.end(contenido);
  } catch (error) {
    // Un archivo que falta es un error del servidor (500), no de quien pide
    // (404): la ruta existia, lo que no existe es el archivo que deberia servir.
    const motivo = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo leer ${rutaAbsoluta}: ${motivo}`);
    responderJson(res, 500, { error: "No se pudo leer el archivo pedido" });
  }
}

/**
 * Entrega un archivo de `publico/`. Devuelve false si no corresponde servirlo,
 * para que el que llama siga con lo suyo (el 404 del final).
 *
 * LA VERIFICACION QUE IMPORTA: despues de resolver la ruta, el resultado tiene
 * que seguir estando ADENTRO de `publico/`. Sin eso, pedir `/../src/config.ts`
 * leeria el codigo fuente y `/../../.dsh/AGENTS.md` leeria la configuracion del
 * equipo.
 *
 * Y no alcanza con buscar ".." en el texto: `%2e%2e%2f` tambien es "..", y hay
 * mas formas de escribirlo. Resolver la ruta y compararla con la raiz es lo que
 * no se puede burlar; filtrar el texto, si.
 */
async function servirEstatico(res: ServerResponse, rutaPedida: string): Promise<boolean> {
  let relativa: string;
  try {
    relativa = decodeURIComponent(rutaPedida);
  } catch {
    responderJson(res, 400, { error: "La ruta tiene un escape invalido" });
    return true;
  }

  if (relativa === "/") relativa = "/index.html";

  const destino = resolve(join(RAIZ_PUBLICA_ABSOLUTA, relativa));
  const adentro =
    destino === RAIZ_PUBLICA_ABSOLUTA || destino.startsWith(RAIZ_PUBLICA_ABSOLUTA + sep);
  if (!adentro) return false;

  const tipo = TIPOS[extname(destino).toLowerCase()];
  if (tipo === undefined) return false;

  try {
    const info = await stat(destino);
    if (!info.isFile()) return false;
  } catch {
    // No existe, o no se puede leer: no es asunto de este nivel decidir el
    // codigo. El 404 del final se encarga.
    return false;
  }

  await servirArchivo(res, destino, tipo);
  return true;
}

/**
 * Reescribe la vista derivada que leen los presets `gabinete` y `rendimiento` (C6).
 *
 * Si falla, NO se le devuelve un error a quien hizo el cambio: el dato ya esta
 * guardado y el tablero es una vista que se puede regenerar. Se avisa por
 * consola y se sigue.
 */
async function republicarTablero(): Promise<void> {
  try {
    await publicarTablero(almacen, almacenPomodoros, ARCHIVO_TABLERO, new Date());
  } catch (falla) {
    const motivo = falla instanceof Error ? falla.message : String(falla);
    console.error(`No se pudo regenerar ${ARCHIVO_TABLERO}: ${motivo}`);
  }
}

const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // `?? "/"` no es decorativo: TypeScript sabe que req.url puede faltar.
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? DIRECCION}`);
  const metodo = req.method ?? "GET";
  console.log(`${metodo} ${url.pathname}`);

  if (metodo === "GET" && url.pathname === "/api/salud") {
    // El return no es decorativo: sin el, el codigo sigue de largo e intenta
    // responder dos veces la misma peticion (ERR_STREAM_WRITE_AFTER_END).
    return responderJson(res, 200, { ok: true });
  }

  try {
    const llevaCuerpo = metodo === "POST" || metodo === "PATCH" || metodo === "PUT";
    const cuerpoCrudo = llevaCuerpo ? await leerCuerpo(req) : "";

    // Las dos capas se prueban en orden. Una ruta de tareas nunca es una de
    // pomodoros, asi que con que conteste una alcanza.
    const deTareas = await manejarApi(metodo, url.pathname, cuerpoCrudo, almacen, hoy());
    const dePomodoros =
      deTareas === null
        ? await manejarApiPomodoros(
            metodo,
            url.pathname,
            cuerpoCrudo,
            almacenPomodoros,
            // Solo se le pasa la capacidad que necesita: saber si una tarea existe.
            (id) => almacen.buscar(id),
            new Date(),
          )
        : null;

    const respuesta = deTareas ?? dePomodoros;

    if (respuesta !== null) {
      if (respuesta.cambio === true) await republicarTablero();
      return responderJson(res, respuesta.codigo, respuesta.cuerpo, respuesta.encabezados ?? {});
    }
  } catch (falla) {
    // Un error inesperado NO puede tumbar el servidor: se responde 500 y el
    // proceso sigue atendiendo. El error de verdad queda en la consola.
    const motivo = falla instanceof Error ? falla.message : String(falla);
    console.error(`Error atendiendo ${metodo} ${url.pathname}: ${motivo}`);
    return responderJson(res, 500, { error: "Error del servidor" });
  }

  // Los archivos de la interfaz. servirEstatico() decide si le corresponde
  // servirlo; si contesta que no, se sigue hasta el 404 del final.
  if (metodo === "GET" && (await servirEstatico(res, url.pathname))) {
    return;
  }

  // Cualquier otra ruta que no sea de la API es un 404. El 405 (metodo
  // equivocado en una ruta que si existe) lo decide la API, que es la que sabe
  // que metodos acepta cada una.
  responderJson(res, 404, { error: `No existe la ruta ${url.pathname}` });
});

// Sin este manejador, un puerto ocupado tira una excepcion cruda y no se
// entiende nada. NodeJS.ErrnoException es el tipo que trae @types/node para
// estos errores del sistema, que son los unicos que tienen `code`.
servidor.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`El puerto ${PUERTO} ya esta ocupado. Proba con otro: $env:PORT=3210; npm.cmd start`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

// 127.0.0.1 y no 0.0.0.0: asi el servidor solo acepta conexiones de este equipo
// y no queda expuesto a la red local (decision C1).
servidor.listen(PUERTO, DIRECCION, () => {
  console.log(`Servidor escuchando en http://${DIRECCION}:${PUERTO}`);
  console.log("Ctrl+C para cortarlo.");
});