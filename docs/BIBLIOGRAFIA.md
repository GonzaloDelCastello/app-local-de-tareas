# Bibliografía

Una fuente por etapa de `RUTA-APRENDIZAJE.md`. El criterio: **documentación oficial o libro reconocido**, no tutoriales de blog. Cuando hay versión en español, se prefiere; cuando no existe, la oficial en inglés es la fuente.

**Sobre las versiones.** La ruta corre sobre **Node v22.19.0** (verificado en `DECISIONES.md`). Los enlaces apuntan a la rama **22.x**, que es la que corresponde. Si Node se actualiza, la fuente sigue sirviendo pero cambian los números de sección.

**Todas las URLs de este archivo fueron verificadas el 2026-10-12** (respuesta HTTP 200).

---

## Etapa 0 — El entorno

**No hay lectura asignada.** La etapa se resuelve ejecutando (`node --version`, `npm.cmd --version`). Lo que enseña es que un comando verifica más que una suposición, y eso no se lee: se hace.

Contexto, solo si aparece la duda:

- [Node.js — Command-line options](https://nodejs.org/docs/latest-v22.x/api/cli.html) — para qué sirve un flag y cómo se leen las variables de entorno.

---

## Etapa 1 — El servidor mínimo

**Fuente principal:** [Node.js — HTTP](https://nodejs.org/docs/latest-v22.x/api/http.html)

Es la referencia del módulo `node:http`. Para esta etapa alcanza con **tres cosas**: `http.createServer()`, `server.listen()` y el evento `'request'`.

> El resto de la página (agentes, sockets, timeouts, keep-alive) **no hace falta leerla todavía**. Es la trampa clásica de esta etapa: la referencia es grande y el 90% no aplica aún.

**Cómo usarla:** buscar en la página `http.createServer` y `response.writeHead`. Nada más.

---

## Etapa 2 — El modelo de datos

**Fuente principal:** [SQLite — SQL As Understood By SQLite](https://sqlite.org/lang.html)

El índice completo del SQL que SQLite entiende. Para esta etapa: `CREATE TABLE` (con sus restricciones) e `INSERT`.

**Fuente secundaria:** [Node.js — SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)

El módulo `node:sqlite`, verificado como disponible sin flag. Es la persistencia de la etapa D2 de `DECISIONES.md`.

---

## Etapa 3 — El contrato

**Fuente principal:** [MDN — Métodos de petición HTTP](https://developer.mozilla.org/es/docs/Web/HTTP/Reference/Methods)

Ahora sí completa: qué método es **seguro**, cuál es **idempotente**, y por qué eso decide si un endpoint se puede repetir sin romper nada.

**Cómo usarla:** leer las definiciones de GET, POST, PATCH y DELETE, y la diferencia entre seguro e idempotente. Es la base de la Etapa 3 completa.

---

## Etapa 4 — La interfaz

**Fuente principal:** [MDN — Fetch API](https://developer.mozilla.org/es/docs/Web/API/Fetch_API)

Para hablar con la API desde el navegador.

**Fuente secundaria:** [MDN — Uso de Fetch](https://developer.mozilla.org/es/docs/Web/API/Fetch_API/Using_Fetch)

Con ejemplos de `await`, manejo de errores y JSON.

**Para el DOM:** [MDN — DOM (glosario)](https://developer.mozilla.org/es/docs/Glossary/DOM) como punto de entrada. Desde ahí, buscar `querySelector`, `addEventListener` y el nodo que haga falta en cada momento.

---

## Etapa 5 — La verificación

**Fuente principal:** [Node.js — Test runner](https://nodejs.org/docs/latest-v22.x/api/test.html)

`node:test` es **estable desde Node v20**, y la ruta corre sobre v22: no hace falta instalar nada.

**Cómo usarla:** la sección *"Running tests from the command line"* para los patrones de nombre de archivo (`**/*.test.js`), y `test()` + `assert` para escribir la primera prueba.

**El principio que la fuente no enseña y hay que sostener:** una prueba que nunca falla no prueba nada. Por eso la etapa pide romper el código a propósito y comprobar que la prueba lo detecta.

---

## Etapa 6 — La integración con los agentes

**No hay fuente externa elegida todavía.** Esta etapa es el objetivo del proyecto, y hoy el material es el propio sistema:

- `C:\Users\gonza\DeepS\ARQUITECTURA.md` — cómo está armado el harness: qué es un preset, qué es una skill, por qué un contrato explícito importa y cómo se monta un proveedor.
- `docs/DECISIONES.md` de este repo — los 11 conceptos transversales, con el caso real que originó cada uno.

**Pendiente:** cuando la etapa se acerque, buscar material serio sobre **diseño de interfaces para agentes** (salidas legibles por máquina, contratos estables, verificación independiente). No hay una fuente canónica elegida, y no se va a improvisar un blog.

---

## Transversal — Git

**Fuente:** [Pro Git, 2ª edición, en español](https://git-scm.com/book/es/v2)

Libro completo, gratis, con licencia Creative Commons. Los capítulos **2 y 3** cubren lo que este proyecto necesita.

---

## Cómo se usa esta bibliografía

1. **No se lee entera antes de empezar.** Se consulta cuando la etapa lo pide.
2. **La fuente oficial gana.** Si un tutorial y la documentación se contradicen, gana la documentación.
3. **Si un concepto de la ruta no está cubierto**, se anota acá como pendiente en lugar de improvisar un tutorial.
