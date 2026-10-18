# Contrato de la API

Todo lo que la app expone por HTTP. El contrato es lo que permite que el navegador
y los agentes cambien sin romperse: si no está escrito, cada consumidor adivina.

**Base:** `http://127.0.0.1:3000` (el puerto se pisa con `$env:PORT`).
**Formato:** JSON, UTF-8 sin BOM, con LF.
**Código:** `src/api.ts`.

---

## Rutas

| Método | Ruta | Qué hace | Éxito |
|---|---|---|---|
| `GET` | `/` | Devuelve `publico/index.html` | `200` |
| `GET` | `/api/salud` | Dice si el servidor está vivo | `200` |
| `GET` | `/api/tareas` | Todas las tareas | `200` |
| `POST` | `/api/tareas` | Crea una tarea | `201` |
| `GET` | `/api/tareas/:id` | Una tarea | `200` |
| `PATCH` | `/api/tareas/:id` | Modifica algunos campos | `200` |
| `DELETE` | `/api/tareas/:id` | Borra una tarea | `204` |

Cualquier otra ruta es `404`.

## Códigos de estado

| Código | Cuándo |
|---|---|
| `200` | Salió bien y hay algo que devolver |
| `201` | Se creó. Viene con `Location: /api/tareas/<id>` |
| `204` | Salió bien y no hay nada que contar (el `DELETE`). **Sin cuerpo** |
| `400` | La solicitud no es válida. El cuerpo trae `detalles` |
| `404` | La ruta no existe, o la tarea pedida no existe |
| `405` | La ruta existe pero no con ese método. Viene con `Allow` |
| `500` | Error del servidor. El detalle queda en la consola, no se filtra |

`404` y `405` **no son lo mismo**: `404` es "esa ruta no existe", `405` es "esa
ruta existe, pero no con ese método". Por eso el `405` dice cuáles sí sirven.

## Formas

### Una tarea

```json
{
  "id": "t-0007",
  "titulo": "Pagar la tarjeta VISA",
  "detalle": "",
  "estado": "pendiente",
  "orden": 0,
  "creadaEl": "2026-10-13",
  "actualizadaEl": "2026-10-13",
  "cerradaEl": null,
  "balde": "A",
  "dependenciasExternas": false,
  "dimension": null,
  "etiquetas": [],
  "venceEl": "2026-10-14",
  "impostergable": true,
  "estimacionMin": null,
  "origen": "bandeja:2026-10-08"
}
```

`estado` es uno de: `pendiente`, `en-curso`, `hecha`, `descartada`.
`balde` es uno de: `A`, `B`, `C`, o `null`. `dimension` es uno de los siete
agentes del cuartel general, o `null`. Las fechas son `AAAA-MM-DD`, la del
calendario.

### La lista

```json
{ "tareas": [ ... ], "total": 3 }
```

Envoltorio y no una lista pelada: así se puede agregar un dato más (un total, una
versión del contrato) sin romper a quien ya lo usa.

### Los errores

```json
{ "error": "La solicitud no es valida", "detalles": ["\"titulo\" es obligatorio y no puede estar vacio"] }
```

`detalles` sólo aparece cuando hay algo concreto que decir, y **nombra el campo**:
quien llama tiene que poder corregir sin adivinar.

## Qué se puede mandar

**Al crear (`POST`)** — `titulo` es obligatorio. Opcionales: `detalle`, `balde`,
`dependenciasExternas`, `dimension`, `etiquetas`, `venceEl`, `impostergable`,
`estimacionMin`, `origen`.

**Al modificar (`PATCH`)** — los mismos, más `estado` y `orden`. Los campos que no
se mandan **no se tocan**.

**Campos que el servidor no acepta de afuera:** `id`, `creadaEl`, `actualizadaEl`,
`cerradaEl`. Mandarlos es `400` con un mensaje que lo dice. `id` porque lo asigna
el almacén (es el único que sabe cuál está libre), y los otros porque son
consecuencia de las operaciones, no datos de entrada.

**`estado` y `orden` no se pueden fijar al crear.** Una tarea nace en `pendiente`
y orden `0`. Si se mandan, es `400`.

**`estado: null` es `400`.** No existe el "sin estado": una tarea siempre está en
alguno de los cuatro. (`balde` y `dimension` sí aceptan `null`: significan "sin
clasificar todavía".)

## Invariantes que el contrato garantiza

1. **Al pasar a `hecha` o `descartada`, `cerradaEl` se completa sola.** No se
   manda: se deriva.
2. **Al reabrir, `cerradaEl` vuelve a `null`.** Una tarea abierta no puede tener
   fecha de cierre.
3. **`actualizadaEl` se refresca en cada cambio.**
4. **El `id` lo asigna el servidor** y no se repite.
5. Un `PATCH` que dejaría la tarea inválida es `400` **y no se guarda**: el
   cambio es todo o nada.

## Efecto sobre el tablero publicado

Cada `POST`, `PATCH` o `DELETE` que sale bien **regenera el `tablero.md`** que
leen los presets `gabinete` y `rendimiento` (decisión C6). Los `GET` no lo tocan.

Si la regeneración falla, la operación **igual se considera exitosa**: el dato ya
está guardado y el tablero es una vista derivada que se puede rehacer. El fallo
queda en la consola del servidor.

---

## Cómo probarlo desde PowerShell

Ojo con dos trampas concretas, las dos verificadas acá:

```powershell
# 1. La trampa de las comillas: --data-raw '{"titulo":"..."}' PIERDE las comillas
#    dobles al pasar por PowerShell 5.1, y el servidor recibe un JSON roto.
#    La forma que funciona es el cuerpo en un archivo, SIN BOM.

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$env:TEMP\body.json", '{"titulo":"Pagar la tarjeta"}', $utf8)

curl.exe -i -X POST http://127.0.0.1:3000/api/tareas `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\body.json"

# 2. La trampa de la lectura: Get-Content sin -Encoding muestra mojibake (Â· en
#    lugar de ·). El archivo está bien; el que decodifica mal es PowerShell.

Get-Content datos\tablero.md -Raw -Encoding UTF8
```

Un archivo de cuerpo **con BOM** hace que el JSON no parsee. Si el servidor
contesta `"el cuerpo no es JSON valido"` y el JSON se ve bien, mirá el BOM.
---

## Pomodoros

| Método | Ruta | Qué hace | Éxito |
|---|---|---|---|
| `GET` | `/api/pomodoros` | Todos, el más reciente primero | `200` |
| `POST` | `/api/pomodoros` | Arranca uno | `201` |
| `GET` | `/api/pomodoros/en-curso` | El que corre ahora, o `null` | `200` |
| `GET` | `/api/pomodoros/:id` | Uno | `200` |
| `PATCH` | `/api/pomodoros/:id` | Lo cierra | `200` |

**Un solo pomodoro a la vez.** El segundo `POST` devuelve `409` con el que ya está corriendo, para que la interfaz pueda mostrarlo en lugar de perderlo.

### La forma

```json
{
  "id": "p-0002",
  "tareaId": "t-0001",
  "iniciadoEl": "2026-10-17T22:31:54.982Z",
  "duracionMin": 25,
  "terminadoEl": null,
  "nota": "",
  "finPrevisto": "2026-10-17T22:56:54.982Z",
  "estado": "en-curso",
  "segundosRestantes": 1500,
  "duracionRealMin": 0
}
```

Los cuatro últimos **no se guardan**: se calculan en cada respuesta. `estado` es `en-curso`, `cumplido` o `cortado`.

**El estado se deriva del reloj**, no de que alguien lo haya marcado: si `ahora >= iniciadoEl + duracionMin`, está cumplido aunque nadie lo haya cerrado. Por eso no hace falta ningún temporizador y el pomodoro sobrevive a cerrar la pestaña o a reiniciar el servidor.

### Qué se puede mandar

- **Al arrancar**: `tareaId` (opcional, pero si viene tiene que existir), `duracionMin` (25 por defecto) y `nota`.
- **Al cerrar**: `estado: "terminado"`. Es lo único que acepta `PATCH`: un pomodoro no se reabre.
- `id`, `iniciadoEl` y `terminadoEl` son del servidor; mandarlos es `400`.

### Instantes y zonas

Es la única parte de la API que usa **hora**, no sólo fecha. Los instantes van en UTC (`...Z`). Para mostrarlos y para agrupar por día se pasan por `America/Argentina/Buenos_Aires`, porque un pomodoro de las 23:50 del 14 es, en UTC, la 01:50 del 15.