# App local de tareas

Tablero de tareas tipo **Kanban** (la "vista de tablero" de Notion) que corre **sólo en este equipo**.

- **Node.js + TypeScript + HTML**, servido en `localhost`. Sin servidor remoto, sin cuentas, sin nube.
- El código se ejecuta **sin compilar**: Node borra los tipos y corre el `.ts` directamente. `npm.cmd run tipos` (`tsc --noEmit`) es lo único que verifica que los tipos cierren.
- Los datos tienen que poder **leerlos y escribirlos** los presets `gabinete` y `rendimiento` del cuartel general (`C:\Users\gonza\DeepS`).
- Incluye un **contador pomodoro**, y el registro de pomodoros es un dato más que la app publica para el agente `rendimiento` (ver C12 en [DECISIONES.md](docs/DECISIONES.md)).
- El objetivo del proyecto es **aprender**: cada pieza se decide, se escribe y se verifica en conjunto.

**Qué publica para los agentes:** en cada cambio escribe `tablero.md` (para leer) y `tareas.json` (para analizar) en `C:\Users\gonza\DeepS\rendimiento\datos\`. La ruta se pisa con `$env:TAREAS_AGENTES`, y se puede regenerar a mano con `node src/exportar.ts`.

**Estado: la app funciona, con pomodoro.** Dominio, almacén, API e interfaz, con **87 pruebas automáticas** y una comprobación de la interfaz contra el servidor real. Lo que falta es el pasaje a SQLite y la integración con los agentes (Etapa 7). Las decisiones se toman en [DECISIONES.md](docs/DECISIONES.md).

## Documentos

| Archivo | Qué contiene |
|---|---|
| [DECISIONES.md](docs/DECISIONES.md) | Las decisiones de arquitectura, con su estado y el porqué |
| [RUTA-APRENDIZAJE.md](docs/RUTA-APRENDIZAJE.md) | Qué conceptos aprender en cada etapa, y en qué orden |
| [API.md](docs/API.md) | **El contrato de la API**: rutas, códigos de estado, formas y errores |
| [BIBLIOGRAFIA.md](docs/BIBLIOGRAFIA.md) | Una fuente oficial por etapa, con las URLs verificadas |

## Cómo se corre

**La forma fácil: doble clic en `iniciar.cmd`.** Arranca el servidor y abre el navegador solo, en `http://127.0.0.1:3000`. La ventana que queda abierta **es** el servidor: `Ctrl+C` o cerrarla lo corta.

O desde una terminal:

```powershell
npm.cmd start
```

Ojo: **`npm` a secas no funciona** en PowerShell — la política de ejecución bloquea `npm.ps1`, y hay que escribir `npm.cmd`. (Si preferís, `node src\servidor.ts` hace exactamente lo mismo: el script `start` es sólo eso.)

`iniciar.cmd` va con **CRLF** y por eso `.gitattributes` tiene una excepción para `*.cmd`: la regla general del proyecto es LF, pero `cmd.exe` necesita CRLF, y con LF los bloques entre paréntesis se rompen justo en el camino que nadie prueba.

Levanta el servidor en `http://127.0.0.1:3000`: sólo atiende conexiones de **este equipo**, no de la red local. **Abrí esa dirección en el navegador** y ahí está el tablero. `Ctrl+C` lo corta. Para otro puerto:

```powershell
$env:PORT=3210; npm.cmd start
```

Qué responde hoy (verificado el 2026-10-13 ejecutando, no leyendo el código):

| Método y ruta | Respuesta |
|---|---|
| `GET /` | `200` con `publico/index.html` |
| `GET /api/salud` | `200` con `{"ok":true}` |
| `GET /api/tareas` | `200` con `{"tareas":[...],"total":N}` |
| `POST /api/tareas` | `201` con la tarea creada y `Location` |
| `GET /api/tareas/:id` | `200` con la tarea, o `404` |
| `PATCH /api/tareas/:id` | `200` con la tarea modificada |
| `DELETE /api/tareas/:id` | `204` sin cuerpo, o `404` |
| `POST /api/pomodoros` | `201` con el pomodoro arrancado, o `409` si ya hay uno |
| `GET /api/pomodoros/en-curso` | `200` con el que corre, o `null` |
| `PATCH /api/pomodoros/:id` | `200`, lo cierra |
| ruta de la API con el método equivocado | `405` con el encabezado `Allow` |
| cualquier otra ruta | `404` con un JSON que dice qué ruta no existe |

El detalle completo —códigos, formas, errores e invariantes— está en [API.md](docs/API.md).

Se verifica contra el puerto, con `curl.exe` y no con el navegador (en PowerShell, `curl` a secas es un alias de `Invoke-WebRequest`: hay que escribir `curl.exe`):

```powershell
curl.exe -i http://127.0.0.1:3000/api/salud
```

Los otros comandos:

```powershell
npm.cmd run tipos          # tsc --noEmit: verifica los tipos, no genera archivos
npm.cmd test               # las pruebas (src\*.test.ts)
node src/demo-almacen.ts   # el ciclo completo contra datos\: guarda tareas y publica el tablero
node src/demo-tablero.ts   # sólo la proyección del tablero, sin tocar el disco
node herramientas/revisar-css.mjs   # llaves, tokens definidos y enlaces del HTML
node src/exportar.ts                # publica tablero.md y tareas.json para los agentes
```

Y la comprobación de la interfaz, que necesita el servidor levantado en otra terminal:

```powershell
$env:BASE="http://127.0.0.1:3000"; node herramientas/probar-interfaz.mjs
```

Ejecuta `publico/app.js` **fuera del navegador** con un DOM de mentira, contra el servidor de verdad: crea una tarea, la mueve de columna, la borra y comprueba el resultado. Prueba la lógica y la integración; **no** el aspecto visual.

Desde una sesión del agente, las pruebas necesitan `--experimental-test-isolation=none`: el runner de `node --test` lanza un subproceso y el sandbox lo bloquea con `EPERM`.

### Las tres versiones del servidor, lado a lado

Hay tres implementaciones del mismo contrato, a propósito (ver C15 y C17 en [DECISIONES.md](docs/DECISIONES.md)):

| Comando | Archivo | Con qué está hecho |
|---|---|---|
| `npm.cmd start` | [src/servidor.ts](src/servidor.ts) | sólo módulos de Node (`node:http`), todo a mano. **Es el activo** |
| — | [src/servidor.mjs](src/servidor.mjs) | el mismo, en JavaScript: quedó como referencia de la migración a TypeScript |
| `npm.cmd run start:express` | [src/servidor-express.mjs](src/servidor-express.mjs) | Express 5.3.0 |

Responden lo mismo y **no pueden correr juntos**: los tres quieren el puerto 3000, y el segundo que arranca muere con exit code 1 y el mensaje de puerto ocupado. La comparación línea por línea de qué hace Express por vos está en [RUTA-APRENDIZAJE.md](docs/RUTA-APRENDIZAJE.md).

Express es la única dependencia de **runtime**; `typescript` y `@types/node` son `devDependencies` y sólo sirven para verificar los tipos, no entran al programa. Desde una sesión del agente, npm no puede escribir en su caché por defecto (vive fuera del workspace), así que para reinstalar hay que apuntarla a un temporal:

```powershell
npm.cmd install --cache "$env:TEMP\npm-cache-dsh"
```

## Estructura

```
src\                          el programa
  tipos.ts                    la forma de los datos
  tarea.ts                    el dominio: la clase Tarea y sus invariantes
  pomodoro.ts                 el pomodoro: dos marcas de tiempo, estado derivado
  exporte.ts                  la proyeccion al esquema que leen los agentes
  almacen.ts                  la persistencia, detras de una interfaz (hoy JSON)
  api.ts                      el contrato de la API
  servidor.ts                 HTTP y entrega de archivos
  config.ts                   rutas y puerto, configurables
  *.test.ts                   las pruebas (87)
  exportar.ts                 publica para los agentes, bajo demanda
  demo-*.ts                   scripts para ver cosas a mano
publico\                      lo que ve el navegador
  index.html
  app.js                      la interfaz, habla con la API y nada mas
  estilos\                    el CSS, en cinco modulos con capas
    tokens.css                solo variables
    base.css                  normalizacion y tipografia base
    layout.css                donde va cada cosa
    componentes.css           como se ve cada pieza
    utilidades.css            clases de un solo proposito
herramientas\                 lo que verifica
  probar-interfaz.mjs         ejecuta app.js fuera del navegador
  revisar-css.mjs             llaves, tokens y enlaces
datos\                        los datos (fuera de git)
docs\                         decisiones, contrato, ruta de aprendizaje
```

## Contexto que no hay que perder de vista

Los presets `gabinete` y `rendimiento` ya mantienen su propio registro de tareas en texto:

| Archivo | Qué es |
|---|---|
| `C:\Users\gonza\DeepS\rendimiento\bandeja.md` | Captura cruda. Listas `- [ ]` con modificadores separados por `·` |
| `C:\Users\gonza\DeepS\gabinete\pendientes.md` | Lo abierto del sistema, y las lecciones aprendidas |
| `C:\Users\gonza\DeepS\rendimiento\jornadas\AAAA-MM-DD.md` | El plan de cada día y su cierre |

Ese texto **no es una base de datos**: tiene prosa y análisis mezclados con las listas, y las secciones de la bandeja se ordenan por **fecha de captura**, no por estado de la tarea. La decisión D1 de [DECISIONES.md](docs/DECISIONES.md) es exactamente qué hace la app con eso.
