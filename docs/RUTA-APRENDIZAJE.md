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

---

## Etapa 4 — La interfaz

**Conceptos:** DOM, eventos, estado en el cliente vs. estado en el servidor, render, por qué el estado se duplica y cómo se sincroniza, drag & drop como problema de estado (no de mouse).

**Se construye:** el tablero con columnas, y crear / mover / editar / borrar.

**Se verifica:** recargando la página. Si el estado se pierde, la persistencia no estaba donde creías.

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
