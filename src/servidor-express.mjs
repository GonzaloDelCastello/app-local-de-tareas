// Servidor de la Etapa 1, version Express (ver docs/RUTA-APRENDIZAJE.md).
//
// Tiene el MISMO contrato que src/servidor.mjs, escrito con Express en lugar de
// node:http. Existe para ver, uno al lado del otro, que hace Express por vos.
// No reemplaza al otro: los dos funcionan, y se arranca el que se quiera.

import express from 'express';
import { join } from 'node:path';

const PUERTO = Number(process.env.PORT ?? 3000);
const RAIZ_PUBLICA = join(import.meta.dirname, '..', 'publico');

// express() crea la aplicacion. Es el equivalente al createServer() de node:http,
// pero vacia: las rutas se le van agregando despues, en orden.
const app = express();

// Express contesta con el encabezado 'X-Powered-By: Express' en cada respuesta,
// que le avisa al mundo que framework usas. No aporta nada util.
app.disable('x-powered-by');

// Reemplaza toda la funcion servirArchivo() de la version node:http: lee el
// archivo, le pone el Content-Type segun la extension, calcula el Content-Length
// en bytes, agrega ETag y soporte de rangos, y rechaza los caminos con '..' que
// intenten salir de publico/. Todo eso que en la otra version hicimos a mano.
// Si el archivo no existe no responde nada: le pasa la peticion al que sigue.
app.use(express.static(RAIZ_PUBLICA));

// app.get(ruta, funcion) es el router: compara el metodo y la ruta, y si no
// coinciden deja pasar la peticion. Reemplaza a los if con req.method y req.url.
app.get('/api/salud', (req, res) => {
  // res.json() serializa, pone 'Content-Type: application/json; charset=utf-8'
  // y calcula el Content-Length en bytes. Es la funcion responderJson() que
  // escribimos a mano, con manejo de escapes incluido.
  res.json({ ok: true });
});

// Este no tiene ruta: se ejecuta cuando NINGUNA de las anteriores respondio.
// Ese es el concepto de middleware: funciones en fila donde cada una decide si
// responde o si le pasa la peticion a la siguiente.
app.use((req, res) => {
  // req.path, a diferencia de req.url, ya viene sin el query string.
  res.status(404).json({ error: `No existe la ruta ${req.path}` });
});

// Los manejadores de error se reconocen por tener CUATRO argumentos, no tres.
// Es la unica forma de que Express sepa que este no es un middleware normal.
// Reemplaza al try/catch que en la otra version envolvia servirArchivo().
app.use((error, req, res, next) => {
  console.error(`Error al responder ${req.method} ${req.path}: ${error.message}`);
  res.status(500).json({ error: 'Error del servidor' });
});

// app.listen devuelve el servidor de node:http que hay por debajo: Express es
// una capa arriba, no un reemplazo. Por eso el puerto ocupado se maneja igual
// que en src/servidor.mjs.
const servidor = app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Servidor EXPRESS escuchando en http://127.0.0.1:${PUERTO}`);
  console.log('Ctrl+C para cortarlo.');
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} ya esta ocupado. Proba con otro: $env:PORT=3210; npm.cmd run start:express`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
