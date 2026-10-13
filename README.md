# App local de tareas

Tablero de tareas tipo **Kanban** (la "vista de tablero" de Notion) que corre **sólo en este equipo**.

- **Node.js + TypeScript + HTML**, servido en `localhost`. Sin servidor remoto, sin cuentas, sin nube.
- El código se ejecuta **sin compilar**: Node borra los tipos y corre el `.ts` directamente. `npm.cmd run tipos` (`tsc --noEmit`) es lo único que verifica que los tipos cierren.
- Los datos tienen que poder **leerlos y escribirlos** los presets `gabinete` y `rendimiento` del cuartel general (`C:\Users\gonza\DeepS`).
- Incluye un **contador pomodoro**, y el registro de pomodoros es un dato más que la app publica para el agente `rendimiento` (ver C12 en [DECISIONES.md](docs/DECISIONES.md)).
- El objetivo del proyecto es **aprender**: cada pieza se decide, se escribe y se verifica en conjunto.

**Estado: la Etapa 1 corre y está verificada.** El resto sigue en diseño. Las decisiones se toman en [DECISIONES.md](docs/DECISIONES.md), y la Etapa 1 todavía no está *recorrida* por Gonzalo: el código lo escribió el agente y el ejercicio de ruptura queda pendiente (ver C14).

## Documentos

| Archivo | Qué contiene |
|---|---|
| [DECISIONES.md](docs/DECISIONES.md) | Las decisiones de arquitectura, con su estado y el porqué |
| [RUTA-APRENDIZAJE.md](docs/RUTA-APRENDIZAJE.md) | Qué conceptos aprender en cada etapa, y en qué orden |
| [BIBLIOGRAFIA.md](docs/BIBLIOGRAFIA.md) | Una fuente oficial por etapa, con las URLs verificadas |

## Cómo se corre

```powershell
npm.cmd start
```

Levanta el servidor en `http://127.0.0.1:3000`: sólo atiende conexiones de **este equipo**, no de la red local. `Ctrl+C` lo corta. Para otro puerto:

```powershell
$env:PORT=3210; npm.cmd start
```

Qué responde hoy (verificado el 2026-10-13 ejecutando, no leyendo el código):

| Método y ruta | Respuesta |
|---|---|
| `GET /` | `200` con `publico/index.html` |
| `GET /api/salud` | `200` con `{"ok":true}` |
| cualquier otra ruta o método | `404` con un JSON que dice qué ruta no existe |

Se verifica contra el puerto, con `curl.exe` y no con el navegador (en PowerShell, `curl` a secas es un alias de `Invoke-WebRequest`: hay que escribir `curl.exe`):

```powershell
curl.exe -i http://127.0.0.1:3000/api/salud
```

Los otros dos comandos de verificación:

```powershell
npm.cmd run tipos    # tsc --noEmit: verifica los tipos, no genera archivos
npm.cmd test         # las pruebas del dominio (src\*.test.ts)
```

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

## Contexto que no hay que perder de vista

Los presets `gabinete` y `rendimiento` ya mantienen su propio registro de tareas en texto:

| Archivo | Qué es |
|---|---|
| `C:\Users\gonza\DeepS\rendimiento\bandeja.md` | Captura cruda. Listas `- [ ]` con modificadores separados por `·` |
| `C:\Users\gonza\DeepS\gabinete\pendientes.md` | Lo abierto del sistema, y las lecciones aprendidas |
| `C:\Users\gonza\DeepS\rendimiento\jornadas\AAAA-MM-DD.md` | El plan de cada día y su cierre |

Ese texto **no es una base de datos**: tiene prosa y análisis mezclados con las listas, y las secciones de la bandeja se ordenan por **fecha de captura**, no por estado de la tarea. La decisión D1 de [DECISIONES.md](docs/DECISIONES.md) es exactamente qué hace la app con eso.
