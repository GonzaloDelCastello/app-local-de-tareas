// Revisa el CSS y el HTML sin abrir un navegador.
//
// QUE COMPRUEBA, Y POR QUE ESAS TRES COSAS
//
//   1. Llaves balanceadas. Una llave de mas rompe TODO el archivo a partir de
//      ese punto, y el navegador no avisa: simplemente ignora reglas.
//   2. Que cada var(--x) que se usa este definido en algun lado. Es el error
//      clasico de un sistema de tokens: se escribe mal un nombre y el color
//      deja de aplicarse EN SILENCIO. No hay error, no hay aviso, y el unico
//      modo de encontrarlo era mirar a ojo.
//   3. Que cada <link rel="stylesheet"> del HTML apunte a un archivo que existe.
//
// Se corre con:  node herramientas/revisar-css.mjs

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath y NO url.pathname: pathname devuelve la ruta codificada, y esta
// carpeta se llama "app local de tareas". Con pathname, el espacio llega como
// %20 y readdir no encuentra nada. 
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PUBLICO = join(RAIZ, "publico");
const DIR_ESTILOS = join(PUBLICO, "estilos");

let fallos = 0;
function afirmar(condicion, descripcion) {
  console.log(`  ${condicion ? "ok  " : "FALLA"} ${descripcion}`);
  if (!condicion) fallos = fallos + 1;
}

// --- 1. leer todos los modulos ---
const archivos = (await readdir(DIR_ESTILOS)).filter((n) => n.endsWith(".css")).sort();
console.log(`Modulos CSS: ${archivos.length} (${archivos.join(", ")})\n`);

const contenidos = new Map();
for (const nombre of archivos) {
  contenidos.set(nombre, await readFile(join(DIR_ESTILOS, nombre), "utf8"));
}

// --- 2. llaves balanceadas ---
console.log("Llaves:");
for (const [nombre, texto] of contenidos) {
  const abre = (texto.match(/{/g) ?? []).length;
  const cierra = (texto.match(/}/g) ?? []).length;
  afirmar(abre === cierra, `${nombre}: ${abre} abre, ${cierra} cierra`);
}

// --- 3. tokens definidos ---
console.log("\nTokens:");
const definidos = new Set();
for (const texto of contenidos.values()) {
  for (const m of texto.matchAll(/(--[a-z0-9-]+)\s*:/g)) definidos.add(m[1]);
}

const sinDefinir = new Map();
for (const [nombre, texto] of contenidos) {
  for (const m of texto.matchAll(/var\((--[a-z0-9-]+)\s*([,)])/g)) {
    const token = m[1];
    const tieneFallback = m[2] === ",";
    if (!definidos.has(token) && !tieneFallback) {
      if (!sinDefinir.has(nombre)) sinDefinir.set(nombre, new Set());
      sinDefinir.get(nombre).add(token);
    }
  }
}

afirmar(definidos.size > 0, `hay ${definidos.size} tokens definidos`);
if (sinDefinir.size === 0) {
  afirmar(true, "todos los var() usados estan definidos");
} else {
  for (const [nombre, tokens] of sinDefinir) {
    afirmar(false, `${nombre} usa tokens que no existen: ${[...tokens].join(", ")}`);
  }
}

// --- 4. los tokens que se definen, se usan? (avisa de los que quedaron de adorno) ---
const usados = new Set();
for (const texto of contenidos.values()) {
  for (const m of texto.matchAll(/var\((--[a-z0-9-]+)/g)) usados.add(m[1]);
}
const sinUsar = [...definidos].filter((t) => !usados.has(t));
console.log("\nTokens definidos y no usados (no es un error, es deuda):");
if (sinUsar.length === 0) {
  console.log("  ninguno");
} else {
  for (const t of sinUsar) console.log(`  ${t}`);
}

// --- 5. los <link> del HTML apuntan a archivos reales ---
console.log("\nEnlaces del HTML:");
const html = await readFile(join(PUBLICO, "index.html"), "utf8");
const enlaces = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
afirmar(enlaces.length === archivos.length, `el HTML enlaza ${enlaces.length} hojas y hay ${archivos.length} modulos`);
for (const enlace of enlaces) {
  const nombre = enlace.replace(/^\/estilos\//, "");
  afirmar(archivos.includes(nombre), `${enlace} existe`);
}

// --- 6. hay un solo archivo suelto de estilos? ---
const sueltos = (await readdir(PUBLICO)).filter((n) => n.endsWith(".css"));
afirmar(sueltos.length === 0, `no quedo ningun .css suelto en publico/ (${sueltos.join(", ") || "ninguno"})`);

console.log("");
if (fallos === 0) {
  console.log("Todo bien.");
} else {
  console.log(`${fallos} comprobaciones fallaron.`);
  process.exitCode = 1;
}