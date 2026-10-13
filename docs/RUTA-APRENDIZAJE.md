# Ruta de aprendizaje

El objetivo no es tener un tablero de tareas: es **poder diseñar software con agentes de IA**. El tablero es el pretexto, y tiene una virtud: es lo bastante chico como para verlo entero, y lo bastante real como para que las decisiones importen.

Punto de partida real: ya escribiste JavaScript, HTML y algo de Express. Así que la ruta **no** empieza por "qué es una variable". Empieza donde se rompe el software de verdad: **persistencia, contratos y verificación**.

---

## Etapa 0 — El entorno (hecha el 2026-10-12)

**Conceptos:** intérprete, versión, PATH, política de ejecución de PowerShell, por qué una verificación vale más que una suposición.

Lo verificado hoy, y cómo:

| Hecho | Comando |
|---|---|
| Node v22.19.0 | `node --version` |
| `node:sqlite` disponible sin flag | `node -e "const {DatabaseSync}=require('node:sqlite'); ..."` |
| `npm` funciona como `npm.cmd`, no como `npm` | `npm.cmd --version` (el `npm.ps1` lo bloquea la ExecutionPolicy) |

**La lección:** los dos primeros resultados se podían *suponer* y estar equivocado. El tercero es un error que solo aparece al ejecutar.

---

## Etapa 1 — El servidor mínimo

**Conceptos:** proceso, puerto, `localhost`, ciclo petición/respuesta, método y ruta, archivo estático vs. respuesta generada, código de estado, JSON como formato de intercambio.

**Se construye:** un servidor HTTP con el módulo `node:http` (sin Express primero, para ver qué hace Express por vos) que sirva un `index.html` y un endpoint `/api/salud` que devuelva `{"ok":true}`.

**Se verifica:** con `curl` o `Invoke-RestMethod` contra el puerto, no con el navegador. Si no podés mostrar la respuesta cruda, no está verificado.

**Comparación con Express — hecha el 2026-10-13 (C15).** La etapa pedía construir el servidor "sin Express primero, para ver qué hace Express por vos". `src/servidor-express.mjs` es el mismo contrato escrito con Express, y esto es lo que cambia:

| Lo que en `node:http` hicimos a mano | Lo que Express hace por vos |
|---|---|
| dos `if` con `req.method` y `req.url` | `app.get(ruta, funcion)`: el router compara método y ruta |
| `new URL(req.url, base)` para separar el query string | `req.path` ya viene sin el query, y `req.query` ya parseado |
| `responderJson()`: `JSON.stringify`, `Content-Type`, `Content-Length` en bytes | `res.json()`, con el manejo de escapes incluido |
| `servirArchivo()`: leer el archivo, deducir el tipo, calcular el largo, atajar el error | `express.static()`, que además agrega `ETag`, `Last-Modified`, `Cache-Control`, `Accept-Ranges`, rangos y el rechazo de rutas con `..` |
| el `404` escrito al final del handler | un middleware sin ruta, puesto al final |
| el `try/catch` alrededor de la lectura | un middleware de error, que Express distingue por tener **cuatro** argumentos |

**Y una diferencia de comportamiento, no de estilo:** si falta el `index.html`, la versión `node:http` responde **`500`** (la ruta existe, el archivo que debía servir no) y la de Express responde **`404`** (el estático no lo encuentra y le pasa la petición al middleware del final). Verificado con una carpeta vacía dentro de `publico/`, que después se borró.

### TypeScript en la Etapa 1 — 2026-10-13 (C16)

El servidor de `node:http` pasó de `src/servidor.mjs` a `src/servidor.ts` **sin build step**: Node borra los tipos y ejecuta el `.ts` directamente. La comparación lado a lado queda viva porque el `.mjs` no se borró.

**Lo que aparece al migrar, y que en JavaScript estaba escondido:**

| Lo que TypeScript te obliga a mirar | Por qué existía igual en JavaScript |
|---|---|
| `req.method` y `req.url` son `string \| undefined` | Siempre pudieron ser `undefined`; nadie te avisaba hasta que se caía |
| En un `catch`, el error es `unknown`, no `Error` | En JavaScript se puede lanzar cualquier cosa: un string, un número |
| `res` hay que tiparlo (`ServerResponse`) y se importa como **tipo** | El tipo existía en tu cabeza, no en el código |

**Las tres reglas duras, porque Node sólo borra tipos y no transforma sintaxis:**

1. **`enum` no se puede usar** — genera código. Se usa unión de literales: `type Estado = "pendiente" | "en-curso" | ...`.
2. **`constructor(public id: string)` no se puede usar** — abrevia y genera código. Los campos se declaran y se asignan a mano.
3. **Los imports llevan la extensión `.ts`** — Node no resuelve módulos TypeScript.

**Y la advertencia central, que es la lección de la etapa:** Node **borra** los tipos, no los verifica. `const n: number = "texto"` se ejecuta sin protestar. El que verifica es `tsc --noEmit` (`npm.cmd run tipos`), y el `tsconfig.json` usa `erasableSyntaxOnly: true` para que rechace justo lo que Node no podría correr. **Sin ese comando, TypeScript es sólo documentación.**

---

## Etapa 2 — El modelo de datos

**Conceptos:** entidad, atributo, tipo, clave primaria, clave foránea, restricción, invariante, estado válido e inválido, esquema, migración.

**Preguntas que hay que responder antes de escribir una tabla:**

- ¿Qué es una tarea? ¿Qué campos tiene? ¿Cuáles son obligatorios?
- ¿Qué estados puede tener? (la lista cerrada, no "lo que se te ocurra")
- ¿Un tablero tiene columnas fijas o configurables?
- ¿Se borra una tarea o se archiva?
- ¿Guarda historial de movimientos? (esto decide si el `UPDATE` alcanza o hace falta una tabla de eventos)

**Se construye:** el esquema en SQL, y una migración versionada.

**Se verifica:** insertando a mano datos inválidos y comprobando que la base los rechaza.

---

## Etapa 3 — El contrato

**Conceptos:** interfaz vs. implementación, contrato estable, validación de entrada, idempotencia, errores como parte de la interfaz.

**Se construye:** la API. `GET /api/tareas`, `POST /api/tareas`, `PATCH /api/tareas/:id`, `DELETE /api/tareas/:id`.

**La lección de fondo:** el contrato es lo que permite que la interfaz y los agentes cambien sin romperse. Si el contrato no está escrito, cada consumidor adivina.

### Hecha el 2026-10-13 (C18)

El contrato escrito está en [API.md](API.md), y el código en `src/api.ts`. 22 pruebas propias, más la verificación con `curl.exe` contra el puerto.

**Lo que apareció al hacerlo, que es lo que la etapa tenía que enseñar:**

| Aparece | Por qué |
|---|---|
| **La validación de entrada es lo que los tipos NO pueden hacer** | `TareaJSON` describe un dato que *ya está bien*. Un cuerpo de petición es `unknown` hasta que alguien lo revisa, y ese alguien es código que corre: los tipos no existen en runtime |
| **`enum` no, pero tampoco `null` como valor** | `tsc` rechazó que `"estado": null` pasara como válido. No era un error de sintaxis: era una inconsistencia semántica real que el tipo destapó. Obligó a separar la validación del estado de la del balde |
| **`404` y `405` no son lo mismo** | `404` es "esa ruta no existe"; `405` es "existe, pero no con ese método". El `405` dice cuáles sí sirven, y por eso lleva el encabezado `Allow` |
| **El error también es parte del contrato** | `400` con `detalles` que **nombran el campo**: quien llama tiene que poder corregir sin adivinar. Un `400` genérico obliga a leer el código del servidor |
| **Un tope para el cuerpo** | Sin tope, un cuerpo enorme consume la memoria del proceso. Una tarea no llega ni cerca de 100 KB |
| **Un error inesperado no puede tumbar el servidor** | El handler envuelve todo: si algo revienta, responde `500` y sigue atendiendo. El detalle queda en la consola, **no se filtra al cliente** |
| **Separar `api.ts` de `servidor.ts`** | Uno sabe de HTTP (sockets, cuerpos, encabezados), el otro del dominio por HTTP (rutas, códigos, validación). Cambiar una regla del tablero no debería obligar a tocar el archivo que maneja sockets |
| **Las trampas de la herramienta de prueba** | `curl.exe --data-raw '{"titulo":"..."}'` **pierde las comillas dobles** al pasar por PowerShell 5.1, y el servidor recibe un JSON roto. Y un archivo de cuerpo **con BOM** tampoco parsea. Las dos están documentadas en [API.md](API.md) |

---

## Etapa 4 — La interfaz

**Conceptos:** DOM, eventos, estado en el cliente vs. estado en el servidor, render, por qué el estado se duplica y cómo se sincroniza, drag & drop como problema de estado (no de mouse).

**Se construye:** el tablero con columnas, y crear / mover / editar / borrar.

**Se verifica:** recargando la página. Si el estado se pierde, la persistencia no estaba donde creías.

### Hecha el 2026-10-13 (C19)

`publico/index.html`, `publico/estilos.css` y `publico/app.js`. Cuatro columnas, crear, mover (arrastrando o con flechas), editar y borrar. Sin framework y sin una sola dependencia.

**El problema central de la etapa, y cómo se resolvió:** el estado vive en **dos lugares** —el servidor y el DOM— y en algún momento van a discrepar. La decisión fue que **manda el servidor**: lo que se muestra es lo último que él devolvió, y después de cada cambio se vuelve a leer. Cuesta una ida y vuelta más; a cambio, no hay dos verdades que puedan separarse. Un cambio que se ve en pantalla y no se guardó es peor que uno que tarda medio segundo.

**Lo que apareció, que es lo que la etapa tenía que enseñar:**

| Aparece | Por qué |
|---|---|
| **`textContent` y nunca `innerHTML`** | El título lo escribe una persona. Con `innerHTML`, un título que contenga `<script>` se ejecuta en el navegador. Es la vía clásica de XSS, y desaparece por completo si los datos nunca se interpretan como código |
| **La fecha de hoy es la del reloj de la pared, no la de UTC** | `new Date().toISOString().slice(0,10)` a las 22 de la Argentina devuelve **el día siguiente**. Es el mismo error que el cuartel general ya tenía documentado para los archivos, ahora en el navegador |
| **`""` no es `null`** | La API pide `null` para "sin fecha". Un input vacío devuelve `""`, que es un `400`. La interfaz tiene que convertir; es trabajo del cliente, no del contrato |
| **`replaceChildren()` reemplaza el array de hijos** | Guardar `tablero.hijos` en una variable y volver a leerla después miente: apunta al array viejo. Le pasó a la herramienta de verificación y dio un falso positivo |
| **El drag & drop es un problema de estado, no de mouse** | `dragover` tiene que hacer `preventDefault()` o el navegador no deja soltar, y hay que recordar *qué* se está arrastrando. Por eso las flechas existen igual: son la operación confiable, el arrastre es la comodidad |
| **El mapa explícito de estáticos** | El servidor no resuelve lo que pide el navegador contra el disco: busca en una lista. Así `../src/config.ts` no tiene por dónde entrar. (Verificado: los tres intentos de salir de `publico/` dan `404`) |

**Y una cosa sobre la verificación, que es de la Etapa 5 pero apareció acá:** "abrir el navegador y fijarse" no es verificable ni repetible. Se escribió [herramientas/probar-interfaz.mjs](../herramientas/probar-interfaz.mjs), que ejecuta `app.js` **fuera del navegador**, con un DOM de mentira pero contra el servidor de verdad: carga el módulo, crea una tarea, la mueve de columna, la borra y comprueba el resultado. Nueve comprobaciones.

**Su límite, dicho sin adornos:** prueba la lógica y la integración con la API, **no** el aspecto visual ni el arrastre real. Un DOM de mentira no es un navegador. Lo que sí garantiza es que el módulo carga sin errores, que las rutas existen y que las columnas se arman: los tres errores que hacen que una interfaz no arranque.

### El sistema de diseño — 2026-10-13 (C20)

El CSS pasó de un archivo a cinco módulos con **capas de cascada** (`@layer`), **tokens** en custom properties y **modo oscuro automático**. No se agregó ninguna dependencia.

**El problema que resuelve `@layer`, que es el motivo de todo esto:** sin capas, para que una regla le gane a otra hay que pelear con **especificidad** — más clases, selectores más largos, `!important`, o depender del orden en que se cargaron los archivos. Esa pelea es la que hace que un CSS grande se vuelva imposible de tocar: nadie sabe por qué una regla no se aplica. Con capas, cada regla vive en un nivel declarado una sola vez, y la prioridad se decide ahí y no en cada selector.

| Lo que apareció | Por qué importa |
|---|---|
| **Un valor, un lugar** | Si un color aparece dos veces en el proyecto, está mal. Los 46 tokens viven en un archivo que no tiene ni un selector |
| **`var(--x)` mal escrito falla en silencio** | No hay error, no hay aviso: el color simplemente no se aplica. Por eso [revisar-css.mjs](../herramientas/revisar-css.mjs) comprueba que cada `var()` usado tenga su definición. Es un error que de otro modo sólo se ve mirando |
| **`display: flex` pisa el `hidden` del navegador** | Un `[hidden]` con `display: flex` se ve igual. Hay que volver a ponerle `display: none`. Es un clásico |
| **Ocultar acciones hasta el hover es una trampa** | Se ve prolijo y deja afuera a quien navega con el teclado. Los botones de la tarjeta quedan discretos, pero siempre visibles |
| **`URL.pathname` con espacios en la ruta** | Devuelve `%20` y cualquier `readdir` falla. Se resuelve con `fileURLToPath`. Y pasó justo en este proyecto, que se llama "app local de tareas" |
| **Servir estáticos no es `join(carpeta, loQuePideElNavegador)`** | Hay que resolver la ruta y comprobar que siga adentro. Buscar `".."` en el texto no alcanza: `%2e%2e%2f` también es `..` |

---

## Etapa 5 — La verificación

**Conceptos:** prueba que ejecuta, aserción, prueba de integración, caso borde, regresión.

**La lección ya aprendida en este equipo:** `node --check` **no es una prueba** — detecta sintaxis, no errores de referencia. Está anotada en `gabinete\pendientes.md` y hay que aplicarla acá desde el principio.

**Se construye:** un archivo de pruebas que levante la base en memoria, ejecute la API y afirme resultados.

**Se verifica:** rompiendo el código a propósito y comprobando que la prueba falla. Una prueba que nunca falla no prueba nada.

---

## Etapa 6 — La integración con los agentes

**Conceptos:** interfaz de línea de comandos, salida legible por máquina, formato estable, contrato entre un programa y un agente, por qué el texto libre no es base de datos.

**Se construye:** el comando que los presets `gabinete` y `rendimiento` van a poder correr, y el archivo de proyección que van a poder leer.

**Se verifica:** abriendo una sesión con cada preset y comprobando que leen y escriben sin ayuda.

---

## Pendiente de ubicar — El pomodoro (decisión C12)

El **contador pomodoro** y el registro de pomodoros que consume el agente `rendimiento` se decidieron como **eventos con marca de tiempo**, con el contador como vista derivada (C12 en `DECISIONES.md`). Todavía **no tienen etapa asignada** en esta ruta: la decisión **D9** elige entre darles una etapa propia antes de la integración, después, o disolverlos en las etapas 2, 3 y 4. No traba la Etapa 1.

Lo que ya se sabe, y condiciona el diseño cuando toque:

- El tiempo es **un dato más**, no un adorno de la pantalla: se guarda con la misma seriedad que una tarea.
- El evento necesita saber **qué tarea** y **cuándo**; un número suelto no alcanza para que `rendimiento` analice nada.
- El pomodoro **en curso** vive en el servidor: recargar la página no puede borrarlo.

Cuando D9 se cierre, esta sección se convierte en la etapa que corresponda, con su fuente en `BIBLIOGRAFIA.md`.

---

## Conceptos transversales: diseñar software con agentes de IA

Esto es lo que de verdad se aprende con este proyecto. Cada punto tiene un ejemplo real de hoy.

**1. Leer antes de opinar.** El agente (y vos) tiene que leer el código que cambió, no recordarlo. Hoy, leer `ARQUITECTURA.md` y después `agentes.json` mostró que la sección 6.1 del documento dice que `rendimiento` no tiene PowerShell, cuando el JSON que genera los presets dice que sí. Uno de los dos está viejo, y solo se descubre leyendo los dos.

**2. Verificar ejecutando.** "Debería funcionar" es una hipótesis. `node:sqlite` podía no estar disponible, o requerir un flag: se supo recién al correrlo.

**3. Una sola fuente de verdad.** Es el modo de falla más común y el más caro. Dos listas de tareas que se sincronizan a mano divergen en dos semanas, y desde ahí el sistema deja de ser confiable: no sabés cuál es la buena.

**4. El estado estructurado y la narrativa no van en el mismo archivo.** `bandeja.md` tiene listas de tareas *y* análisis en prosa *y* tablas de clasificación. Se puede leer, no se puede automatizar sin riesgo. Separarlos es la decisión de arquitectura más importante de este proyecto.

**5. Contratos explícitos.** Cuanto más explícito el formato, menos adivina el agente. Un esquema escrito es contexto reutilizable; una convención tácita es una alucinación esperando.

**6. Alcance acotado.** Un cambio chico produce un diff revisable. Un cambio grande produce un diff que se aprueba sin leer, y aprobar sin leer es no tener control.

**7. El contexto del agente es un recurso finito.** Por eso existen `AGENTS.md` y las skills: son memoria externa que se carga solo cuando hace falta. Escribir para un agente es escribir documentación operativa.

**8. Puntos de control humanos.** Commit, push y credenciales los decide una persona. Un agente que commitea solo te saca la última revisión que tenías.

**9. Verificación independiente.** El que revisa no debería ser el que escribió. Con agentes esto es literal: una instancia escribe, otra revisa, y la segunda no ve las intenciones de la primera, solo el resultado.

**10. Preguntar antes de destruir.** Reorganizar, mover o borrar pide confirmación. Vale para un agente y vale para un script.

**11. Lo que no se puede reproducir, no está terminado.** Si para saber si algo anda hay que "abrir la app y fijarse", no hay forma de saber si el cambio de ayer lo rompió.

---

## Cómo se va a trabajar

El método se elige en la decisión **D4** de `DECISIONES.md`. La regla que no se negocia: **cada etapa termina con algo que corre y se puede mostrar**, no con código escrito y sin probar.
