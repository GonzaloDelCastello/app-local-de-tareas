# Reglas de este repositorio

Proyecto de aprendizaje: un tablero de tareas local (Kanban) en Node.js + HTML.
El plan y las decisiones estan en `docs/`.

## Idioma

- Todo en espanol: codigo, comentarios, documentos y mensajes de error propios.
- Rutas, comandos, identificadores y nombres de producto: tal cual, sin traducir.

## Antes de opinar

- Leer `docs/DECISIONES.md` primero. **Las decisiones cerradas no se reabren sin decirlo explicitamente.**
- Leer el codigo antes de proponer cambios sobre el: no opinar de memoria.

## Escritura de archivos

- **Leer un archivo antes de escribirlo. Nunca sobrescribir a ciegas.** El 2026-10-13 una sesion sobrescribio `package.json` sin leerlo y se perdieron la `description` y los scripts; se recuperaron desde git.
- **Antes de reconstruir un archivo de memoria, mirarlo en git:** `git show HEAD:package.json`. La copia versionada es la fuente de verdad, no el recuerdo.
- **Este shell es PowerShell 5.1**, y en 5.1 `Set-Content -Encoding utf8` escribe **con BOM**. La convencion del proyecto es UTF-8 **sin BOM**. Para escribir texto, usar:
  ```powershell
  [System.IO.File]::WriteAllText($ruta, $texto, (New-Object System.Text.UTF8Encoding($false)))
  ```
- Los saltos de linea van en **LF**: reemplazar `\r\n` por `\n` antes de escribir.
- Para tocar `package.json` no se edita a mano: se usa `npm.cmd pkg set scripts.<nombre>="<comando>"`.

## Verificacion

- **No afirmar que algo funciona sin haberlo ejecutado.** Si no se pudo verificar, decirlo.
- `node --check` **no es una prueba**: detecta sintaxis, no errores de referencia. Hay que ejecutar el modulo.
- Comandos del proyecto (los del `package.json`): `npm.cmd start`, `npm.cmd run start:express`, `npm.cmd test` y `npm.cmd run tipos`.
  `start` corre `node src/servidor.ts` y `start:express` corre `node src/servidor-express.mjs`. Los dos escuchan en `http://127.0.0.1:3000` (se puede pisar con `$env:PORT`) y **no pueden convivir**.
- `npm.cmd run tipos` corre `tsc --noEmit`: verifica los tipos **sin generar archivos**. Es la unica verificacion que convierte los tipos en una garantia. `node` solo BORRA los tipos: ejecuta igual un `const n: number = "texto"`.
- Hay pruebas en `src/*.test.ts`. **Desde una sesion del agente** hay que agregar `--experimental-test-isolation=none`: el runner de `node --test` lanza un subproceso y el sandbox lo bloquea con `EPERM`. En una terminal normal, `npm.cmd test` alcanza.
- Desde una sesion del agente, `npm install` necesita `--cache "$env:TEMP\npm-cache-dsh"`: su cache por defecto vive fuera del workspace y falla con `EPERM`.
- El servidor se verifica **contra el puerto**, con `curl.exe -i`, no con el navegador. Ojo: en PowerShell `curl` a secas es un alias de `Invoke-WebRequest`.
- Todavia no hay pruebas escritas. `node --test` con cero archivos de prueba sale con exit code 0 (verificado en v22.19.0).

## Entorno verificado (2026-10-12)

| Hecho | Detalle |
|---|---|
| Node | v22.19.0 en `C:\Program Files\nodejs\node.exe` |
| `npm` | El `npm.ps1` esta bloqueado por la ExecutionPolicy: **usar `npm.cmd`** |
| `node:sqlite` | Disponible sin flag, con `ExperimentalWarning`. Es la persistencia de la segunda etapa (D2) |

## Git

- **Nunca commitear ni hacer push sin preguntar.** Gonzalo decide que se confirma y cuando.
- Mensajes de commit en espanol, en imperativo.

## Convenciones de archivos

Heredadas del cuartel general (`C:\Users\gonza\DeepS\AGENTS.md`):

- **UTF-8 sin BOM.** Fin de linea LF.
- Nombres de archivo en **minusculas, con guiones, sin acentos ni enie**.
- Fechas `AAAA-MM-DD`, la del calendario.
- Markdown para texto, JSON o CSV para datos estructurados.

## Datos y secretos

- **Nunca credenciales, claves ni tokens en archivos del repo.**
- Los datos reales de tareas no viven en este repositorio (ver C11 en `docs/DECISIONES.md`).
- Datos de terceros: este proyecto no los toca.

## Alcance y metodo

- **Metodo por pasos** (decision D4): Gonzalo escribe el codigo, el agente propone y revisa.
  **No escribir codigo de la aplicacion si no se pidio explicitamente.**
- El andamiaje, los documentos y los comandos de verificacion si los puede escribir el agente.
