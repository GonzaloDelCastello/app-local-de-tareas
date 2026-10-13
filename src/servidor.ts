// Servidor HTTP de la Etapa 1, migrado a TypeScript.
//
// Es el MISMO contrato que src/servidor.mjs: los dos responden lo mismo. La
// migracion no cambio el comportamiento; cambio lo que TypeScript te OBLIGA a
// mirar. Aparecieron tres cosas que en JavaScript estaban escondidas:
//
//   1. req.method y req.url pueden ser undefined. En JavaScript escribias
//      `req.url` y andaba; TypeScript te avisa que el tipo es
//      `string | undefined` y no te deja pasarlo a new URL() sin resolverlo.
//   2. En un catch, el error es `unknown`, no `Error`. Cualquier cosa puede
//      lanzarse en JavaScript: un string, un numero, lo que sea.
//   3. Las funciones que reciben res tienen que decir QUE es res
//      (ServerResponse), y eso se importa como TIPO, no como valor.
//
// Ninguna de las tres es burocracia: las tres son cosas que en JavaScript
// existian igual y nadie te avisaba hasta que el programa se caia.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// La configuracion sale de config.ts y no esta repetida aca: un solo lugar
// donde mirar cuando algo cambia de valor (decision C11).
import { DIRECCION, PUERTO, RAIZ_PROYECTO } from "./config.ts";

const RAIZ_PUBLICA = join(RAIZ_PROYECTO, "publico");

// `datos: unknown` y no `any`: quien llama puede pasar cualquier cosa, y
// JSON.stringify acepta cualquier cosa. `unknown` obliga a pensarlo; `any` lo
// esconde.
function responderJson(res: ServerResponse, codigo: number, datos: unknown): void {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    // charset=utf-8 para que los acentos no salgan rotos.
    "Content-Type": "application/json; charset=utf-8",
    // byteLength y no cuerpo.length: un acento ocupa mas de un byte.
    "Content-Length": Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
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
    // En TypeScript el error de un catch es `unknown`: hay que averiguar que es
    // antes de leerle una propiedad. Sin el instanceof, error.message no compila.
    const motivo = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo leer ${rutaAbsoluta}: ${motivo}`);
    responderJson(res, 500, { error: "No se pudo leer el archivo pedido" });
  }
}

const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // `?? "/"` no es decorativo: TypeScript sabe que req.url puede faltar.
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? DIRECCION}`);
  console.log(`${req.method ?? "?"} ${url.pathname}`);

  if (req.method === "GET" && url.pathname === "/api/salud") {
    // El return no es decorativo: sin el, el codigo sigue de largo e intenta
    // responder dos veces la misma peticion (ERR_STREAM_WRITE_AFTER_END).
    return responderJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return servirArchivo(res, join(RAIZ_PUBLICA, "index.html"), "text/html; charset=utf-8");
  }

  // Todo lo demas es 404. En la Etapa 3 se ve por que un metodo equivocado
  // merece 405 y no 404: no son la misma cosa.
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