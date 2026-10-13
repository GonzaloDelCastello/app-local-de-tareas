# Decisiones

Registro de decisiones de arquitectura. Formato: **qué se decidió — por qué — cuándo — cómo se verifica.**
Las decisiones cerradas no se reabren sin decirlo explícitamente.

## Cerradas

| # | Decisión | Fecha | Por qué |
|---|---|---|---|
| C1 | Corre sólo en este equipo, en `localhost` | 2026-10-12 | Pedido explícito: sin nube, sin cuentas, sin servidor remoto |
| C2 | Node.js + HTML | 2026-10-12 | Pedido explícito |
| C3 | El proyecto vive en `C:\Users\gonza\Documents\Desarrollo\app local de tareas` | 2026-10-12 | Pedido explícito |
| C4 | Los datos tienen que ser legibles para los presets `gabinete` y `rendimiento` | 2026-10-12 | Pedido explícito |
| C5 | El objetivo es aprender: se decide y se verifica en conjunto | 2026-10-12 | Pedido explícito |
| **C6** | **La app es dueña del estado de las tareas y publica una vista markdown derivada** | 2026-10-12 | Decisión D1. Frontera: la app guarda **estado** (con ID propio), los agentes escriben **captura cruda** en `bandeja.md`. No se pisan |
| **C7** | **Persistencia en JSON primero, SQLite después, detrás de la misma interfaz** | 2026-10-12 | Decisión D2. Ruta progresiva: se aprende el modelo de datos antes que SQL, y el cambio queda contenido en un solo módulo |
| **C8** | **Método por pasos: el agente propone, Gonzalo escribe, el agente revisa** | 2026-10-12 | Decisión D4. Es el método que enseña; prioriza el aprendizaje sobre la velocidad |
| **C9** | **Interfaz en HTML + JS vanilla, servida por Node** | 2026-10-12 | Decisión D5. Sin framework ni bundler: se ve el DOM, los eventos y `fetch` sin magia |
| **C10** | **`git init` + `.gitignore` + `AGENTS.md` propio del repo** | 2026-10-12 | Decisión D6. El `.git` además fija la raíz de proyecto para `AGENTS.md` |
| **C11** | **La ruta de los datos es configurable: `datos\` por defecto, la real se apunta cuando la app esté lista** | 2026-10-12 | Decisión D7, opción C. El código no cambia cuando el dato cambia de lugar |
| **C12** | **El pomodoro se registra como eventos con marca de tiempo; el contador de pomodoros es una vista derivada** | 2026-10-12 | Decisión D8. Un entero acumulado en la tarea no se puede auditar ni cruzar con horarios, que es lo que necesita `rendimiento` |
| **C13** | **El código se publica en GitHub en un repositorio privado; los datos de tareas no salen de este equipo** | 2026-10-12 | El repo local no tenía remoto y el `push` fallaba. Privado porque los documentos citan rutas del equipo y el modo de trabajo local |

**Consecuencias de C11:** la ruta de datos vive en `config.mjs`, no dispersa en el código. El valor por defecto apunta a `datos\` dentro del repo (ya excluido por `.gitignore`), así que el desarrollo no escribe fuera del proyecto. El markdown derivado que leen los agentes se publica en la ruta que fije la configuración.

**Consecuencias de C12:** un evento es *inicio*, *fin* o *abandono*, con marca de tiempo y tarea asociada; el número que ve el tablero se calcula. Se sostiene en H4: los datos son la fuente de verdad, los resúmenes son vistas. **Y agrega un requisito duro a la interfaz:** el pomodoro en curso tiene que sobrevivir a recargar la página, así que su estado vive en el servidor, no en el DOM. Si el reloj corriera sólo en el navegador, cerrar la pestaña perdería el conteo y `rendimiento` leería datos incompletos.

**Consecuencias de C13:** el remoto `origin` quedó apuntando a `https://github.com/GonzaloDelCastello/app-local-de-tareas.git` (agregado el 2026-10-12, sin subir todavía). `datos\` sigue excluido por `.gitignore` (C11), así que se publican **código y documentos, nunca tareas**. La autenticación la resuelve Git Credential Manager: el token vive en el gestor de credenciales de Windows y **nunca** en un archivo del repo.

## Hallazgos del relevamiento — 2026-10-12

Leído y verificado contra el cuartel general (`C:\Users\gonza\DeepS`) y el perfil instalado. **Estos hechos condicionan el diseño.**

### H1 — El bundle instalado está desincronizado con su fuente

`node tools/generar-presets/generar.mjs --verificar` **falla con exit code 1**:

```
rendimiento: el rol NO sobrevivio el round-trip. Primera diferencia en el caracter 114:
  escrito="Dos tareas:"  original="Tres tareas:"
```

Consecuencia: la persona de `rendimiento` que la app corre hoy es la vieja, y `agentes.json` declara `"shell"` para `rendimiento` e `it-remoto` pero el YAML generado **no tiene `tool-pwsh` en ninguno de los dos**. Hay un pendiente declarado en `gabinete\pendientes.md` sobre regenerar y reiniciar.

**Corrección de un error propio:** la primera versión de este documento afirmaba que `rendimiento` tiene `shell`, basándose sólo en `agentes.json`. Leyó la fuente equivocada: la que manda es la instalada. Queda como ejemplo real del principio "leer antes de opinar", con el agregado de que **"la fuente de verdad" puede estar ella misma duplicada**.

### H2 — Las tareas no tienen identidad

Ni `rendimiento\bandeja.md` ni `gabinete\pendientes.md` tienen ID, estado por ítem ni fecha por ítem. **La identidad de una tarea es su línea de texto, y su posición en la lista.** `pendientes.md` se renumera `1.`…`6.` y se reescribe entero, así que el número tampoco sirve como clave.

Por eso C6 dice que **la app genera los IDs**: es lo que hoy no existe.

### H3 — El formato de la bandeja es acumulativo, no reescribible

`bandeja.md` crece por secciones `## Capturado el AAAA-MM-DD`, con prosa, tablas de clasificación y análisis entre las listas. La regla de facto: **agregar una sección, nunca reescribir el archivo.**

Línea real del archivo:

```markdown
- [ ] **Pagar tarjeta VISA** · vence **14/10** · debe $47.500 · **impostergable**
- [x] **Pagar internet** · hecho 2026-10-09
```

### H4 — Ya hay una convención declarada sobre quién manda

`C:\Users\gonza\DeepS\AGENTS.md`:

> **Los datos son la fuente de verdad; los tableros y resúmenes son vistas derivadas; si un tablero contradice a los datos, ganan los datos.**

C6 es coherente con esto: la base de la app son **los datos**, y el markdown que publica es **la vista derivada**.

### H5 — Convenciones de formato que la app debe respetar

| Convención | Valor verificado |
|---|---|
| Codificación | UTF-8 **sin BOM**. Leer en Node con `fs.readFileSync(p, 'utf8')` |
| Fin de línea | LF al escribir; aceptar CRLF al leer |
| Nombres de archivo | minúsculas, con guiones, **sin acentos ni `ñ`** |
| Fechas | `AAAA-MM-DD` (día del calendario), semanas `AAAA-Www` |
| Un archivo por registro | nunca un archivo único que crece sin control (la bandeja es la excepción de facto) |
| Frontmatter YAML | **sólo** en `SKILL.md`. Ningún archivo de datos lo usa |
| Alcance vedado | `privado\` y `docente\seguimientos\`: la app no los toca. Nunca credenciales en archivos |

`Get-Content` de PowerShell muestra mojibake con estos archivos; **están bien**, es la herramienta la que decodifica mal.

## Abiertas

### D3 — Alcance del primer MVP

Propuesta: **A**, y el resto como etapas siguientes. El MVP tiene que quedar usable antes de agregar la etapa que sigue.

| Opción | Qué incluye |
|---|---|
| **A. Tablero mínimo** | Columnas, crear / mover / editar / borrar tareas, persistencia, API HTTP |
| **B. + vistas y clasificación** | Filtro "hoy / semana", los baldes A/B/C que ya usa la bandeja, etiquetas por dimensión (`docente`, `desarrollo`, `salud`, ...) |
| **C. + integración** | Importar y exportar contra los archivos del cuartel general |

**Estado:** sin decidir. No traba la Etapa 1.

### D7 — Dónde viven los datos

**Resuelta el 2026-10-12 como C11 (opción C, ruta configurable).** Las tres opciones que se evaluaron: (A) directo en el cuartel general, (B) en el repo con proyección hacia afuera, (C) ruta configurable. Se eligió C porque el código no cambia cuando el dato cambia de lugar.

### D9 — Dónde entra el pomodoro en la secuencia de la ruta

**Qué falta decidir:** el pomodoro (C12) no tiene etapa asignada en `RUTA-APRENDIZAJE.md`. Toca tres etapas ya escritas: el modelo de eventos (Etapa 2), los endpoints (Etapa 3) y el reloj en pantalla (Etapa 4).

| Opción | Qué implica |
|---|---|
| **A. Etapa nueva después de la interfaz, y la integración con agentes pasa a ser la última** | La integración publica tareas *y* pomodoros de una sola vez, así que se escribe una vez. Renumera la Etapa 6 actual y toca `BIBLIOGRAFIA.md` |
| **B. Etapa nueva al final, después de la integración** | No renumera nada. Costo: se integra con los agentes sabiendo que falta agregarles los pomodoros, y esa parte se integra dos veces |
| **C. Disuelto dentro de las etapas 2, 3 y 4** | Sin etapa propia. Costo: se pierde el hilo de "el tiempo como dato", que es justo lo que el proyecto quiere enseñar |

**Recomendada: A.** No traba la Etapa 1: se puede decidir cuando se cierre la Etapa 3.

**Estado:** sin decidir.

## Hechos del entorno ya verificados

| Hecho | Cómo se verificó | Fecha |
|---|---|---|
| Node v22.19.0 en `C:\Program Files\nodejs\node.exe` | `node --version` | 2026-10-12 |
| `node:sqlite` funciona sin flag (sólo `ExperimentalWarning`) | `node -e "const {DatabaseSync}=require('node:sqlite'); ..."` ejecutado | 2026-10-12 |
| `npm` responde como `npm.cmd` (10.9.3) | `npm --version` falla por ExecutionPolicy; `npm.cmd --version` responde | 2026-10-12 |
| git 2.51.0, repositorio inicializado en rama `main` | `git init -b main` | 2026-10-12 |
| `gabinete` tiene `shell`, `trabajos`, `plan` y `delegar` | YAML generado del bundle instalado | 2026-10-12 |
| `rendimiento` **no** tiene `shell` ni `plan` en lo instalado | Ibídem. Contradice a `agentes.json` (ver H1) | 2026-10-12 |
| Ningún preset restringe rutas de archivos: el alcance lo fija el workspace | `tool-fs` montado sin config; `ARQUITECTURA.md` §5.5 | 2026-10-12 |
| Las 12 skills las ven **los siete** agentes: no hay asignación por preset | Único `customSkillDirs` en el perfil | 2026-10-12 |
| La sesión del agente **no tiene salida a GitHub**: `curl` y `git ls-remote` fallan con `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`, igual contra `github.com` que contra `example.com`. El DNS sí resuelve (`github.com` → `4.228.31.150`), así que es aislamiento de la sesión y no falta de red. **Consecuencia: `push` y `pull` los corre Gonzalo** | `curl.exe -sS https://github.com`, `git ls-remote https://github.com/octocat/Hello-World HEAD` (exit 128) | 2026-10-12 |
