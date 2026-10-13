// Servidor HTTP de la Etapa 1 (ver docs/RUTA-APRENDIZAJE.md).
//
// Objetivo de la etapa: ver el ciclo peticion/respuesta a mano, sin Express.
// Solo se usan modulos que ya vienen con Node: el proyecto no tiene dependencias.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// El puerto se puede pisar desde afuera sin tocar el codigo: PORT=3210 npm start
const PUERTO = Number(process.env.PORT ?? 3000);

// import.meta.dirname es la carpeta de ESTE archivo (src/), no la carpeta desde
// la que se lanzo el comando. Con una ruta relativa ('publico/index.html') el
// servidor andaria o no segun donde estes parado cuando lo arrancas.
const RAIZ_PUBLICA = join(import.meta.dirname, '..', 'publico');

function responderJson(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    // charset=utf-8 para que los acentos no salgan rotos.
    'Content-Type': 'application/json; charset=utf-8',
    // byteLength y no cuerpo.length: un acento ocupa mas de un byte.
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

async function servirArchivo(res, rutaAbsoluta, tipoContenido) {
  try {
    const contenido = await readFile(rutaAbsoluta);
    res.writeHead(200, {
      'Content-Type': tipoContenido,
      'Content-Length': contenido.length,
    });
    res.end(contenido);
  } catch (error) {
    // Un archivo que falta es un error del servidor (500), no de quien pide (404):
    // la ruta existia, lo que no existe es el archivo que deberia servir.
    console.error(`No se pudo leer ${rutaAbsoluta}: ${error.message}`);
    responderJson(res, 500, { error: 'No se pudo leer el archivo pedido' });
  }
}

const servidor = createServer(async (req, res) => {
  // req.url trae tambien el query string ('/?x=1'). new URL lo separa:
  // url.pathname es la ruta sin los parametros, y url.searchParams son los
  // parametros. Ojo: pathname NO decodifica los escapes: '/caf%C3%A9' queda
  // asi, no se convierte en '/café'. Para la Etapa 1 alcanza porque las rutas
  // son fijas; cuando la ruta lleve datos va a hacer falta decodeURIComponent.
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  console.log(`${req.method} ${url.pathname}`);

  if (req.method === 'GET' && url.pathname === '/api/salud') {
    // El return no es decorativo: sin el, el codigo sigue de largo e intenta
    // responder dos veces la misma peticion (ERR_STREAM_WRITE_AFTER_END).
    return responderJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/') {
    return servirArchivo(res, join(RAIZ_PUBLICA, 'index.html'), 'text/html; charset=utf-8');
  }

  // Todo lo demas es 404. En la Etapa 3 se ve por que un metodo equivocado
  // merece 405 y no 404: no son la misma cosa.
  responderJson(res, 404, { error: `No existe la ruta ${url.pathname}` });
});

// Sin este manejador, un puerto ocupado tira una excepcion cruda y no se entiende nada.
servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} ya esta ocupado. Proba con otro: $env:PORT=3210; npm.cmd start`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

// 127.0.0.1 y no 0.0.0.0: asi el servidor solo acepta conexiones de este equipo
// y no queda expuesto a la red local (decision C1).
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Servidor escuchando en http://127.0.0.1:${PUERTO}`);
  console.log('Ctrl+C para cortarlo.');
});
