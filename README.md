# App local de tareas

Tablero de tareas tipo **Kanban** (la "vista de tablero" de Notion) que corre **sólo en este equipo**.

- **Node.js + HTML**, servido en `localhost`. Sin servidor remoto, sin cuentas, sin nube.
- Los datos tienen que poder **leerlos y escribirlos** los presets `gabinete` y `rendimiento` del cuartel general (`C:\Users\gonza\DeepS`).
- Incluye un **contador pomodoro**, y el registro de pomodoros es un dato más que la app publica para el agente `rendimiento` (ver C12 en [DECISIONES.md](docs/DECISIONES.md)).
- El objetivo del proyecto es **aprender**: cada pieza se decide, se escribe y se verifica en conjunto.

**Estado: diseño.** Todavía no hay código. Primero se cierran las decisiones de [DECISIONES.md](docs/DECISIONES.md).

## Documentos

| Archivo | Qué contiene |
|---|---|
| [DECISIONES.md](docs/DECISIONES.md) | Las decisiones de arquitectura, con su estado y el porqué |
| [RUTA-APRENDIZAJE.md](docs/RUTA-APRENDIZAJE.md) | Qué conceptos aprender en cada etapa, y en qué orden |
| [BIBLIOGRAFIA.md](docs/BIBLIOGRAFIA.md) | Una fuente oficial por etapa, con las URLs verificadas |

## Cómo se corre

Todavía no aplica: no hay código. Cuando exista, el comando va acá y se prueba antes de escribirlo.

## Contexto que no hay que perder de vista

Los presets `gabinete` y `rendimiento` ya mantienen su propio registro de tareas en texto:

| Archivo | Qué es |
|---|---|
| `C:\Users\gonza\DeepS\rendimiento\bandeja.md` | Captura cruda. Listas `- [ ]` con modificadores separados por `·` |
| `C:\Users\gonza\DeepS\gabinete\pendientes.md` | Lo abierto del sistema, y las lecciones aprendidas |
| `C:\Users\gonza\DeepS\rendimiento\jornadas\AAAA-MM-DD.md` | El plan de cada día y su cierre |

Ese texto **no es una base de datos**: tiene prosa y análisis mezclados con las listas, y las secciones de la bandeja se ordenan por **fecha de captura**, no por estado de la tarea. La decisión D1 de [DECISIONES.md](docs/DECISIONES.md) es exactamente qué hace la app con eso.
