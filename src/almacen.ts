// La capa de persistencia, detras de UNA sola interfaz (decision C7).
//
// POR QUE UNA INTERFAZ Y NO UN ARCHIVO SUELTO
//
// C7 dice: JSON primero, SQLite despues, detras de la misma interfaz. Lo que
// hace que ese cambio sea barato no es el formato, es esto: el resto del
// programa depende de `Almacen`, no de `AlmacenJSON`. El dia que exista
// `crearAlmacenSQLite()`, el servidor cambia UNA linea y nada mas.
//
// Los metodos son `async` aunque leer un archivo podria ser sincronico. El
// motivo es que la implementacion de SQLite (y cualquier otra que venga
// despues: una base remota, un archivo en red) no tiene por que serlo. Si la
// interfaz fuera sincronica, cambiar la implementacion obligaria a cambiar a
// todos los que la usan.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Tarea } from "./tarea.ts";
import { proyectarTablero } from "./tarea.ts";

/**
 * Lo que se puede hacer con las tareas guardadas.
 *
 * Esta es la frontera: quien use el almacen no sabe si los datos estan en un
 * JSON, en SQLite o en un archivo de texto.
 */
export interface Almacen {
  /** Todas las tareas. Lista vacia si todavia no hay ninguna. */
  listar(): Promise<Tarea[]>;
  /** La tarea con ese id, o null. */
  buscar(id: string): Promise<Tarea | null>;
  /** Agrega, o reemplaza si ya existe una con el mismo id. */
  guardar(tarea: Tarea): Promise<void>;
  /** La saca. Si no existe, no hace nada. */
  eliminar(id: string): Promise<void>;
  /** El proximo id libre, con el formato t-0001. */
  siguienteId(): Promise<string>;
}

/** `ENOENT` es "el archivo no existe". La primera vez es normal, no un error. */
function esArchivoFaltante(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Los codigos con los que Windows dice "ahora no puedo, el archivo esta en uso".
 * No significan que la operacion sea imposible: significan que hay que esperar.
 */
const CODIGOS_DE_BLOQUEO = ["EPERM", "EACCES", "EBUSY"];

function esperar(milisegundos: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

/**
 * Renombra, y si el sistema contesta que el archivo esta ocupado, lo reintenta.
 *
 * POR QUE EXISTE ESTA FUNCION (verificado el 2026-10-13 ejecutando, no leyendo):
 * el primer `rename` funciono y el segundo fallo con EPERM. No era el codigo, ni
 * la ruta, ni el sandbox: en Windows, si el antivirus o el indizador de archivos
 * tiene el archivo abierto un instante, el renombre falla. El sintoma era el peor
 * posible: `tareas.json` con una tarea y un `.tmp` con dos.
 *
 * Se reintenta con una espera que crece (30, 60, 90 ms), y solo con los codigos
 * de bloqueo. Un ENOENT no se reintenta: reintentar no lo va a arreglar.
 *
 * `renombrar` se puede pasar desde afuera a proposito: asi la prueba puede
 * simular que el sistema falla dos veces sin depender del sistema operativo.
 */
export async function renombrarConReintentos(
  origen: string,
  destino: string,
  renombrar: (origen: string, destino: string) => Promise<void> = rename,
  intentos = 5,
  esperaMs = 30,
): Promise<void> {
  for (let intento = 1; ; intento++) {
    try {
      await renombrar(origen, destino);
      return;
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      const esElUltimo = intento >= intentos;
      const valeReintentar = codigo !== undefined && CODIGOS_DE_BLOQUEO.includes(codigo);
      if (esElUltimo || !valeReintentar) throw error;
      await esperar(esperaMs * intento);
    }
  }
}

class AlmacenJSON implements Almacen {
  private readonly ruta: string;

  constructor(ruta: string) {
    this.ruta = ruta;
  }

  /**
   * Lee y convierte TODO, en cada operacion.
   *
   * Es simple y para cientos de tareas alcanza de sobra. Tiene un limite
   * honesto: con miles de tareas, guardar una sola reescribe el archivo entero.
   * Cuando eso moleste, es exactamente el momento de pasar a SQLite, y el
   * cambio queda encerrado en esta clase.
   */
  private async leer(): Promise<Tarea[]> {
    let texto: string;
    try {
      // 'utf8' explicito: sin esto llega un Buffer, no texto.
      texto = await readFile(this.ruta, "utf8");
    } catch (error) {
      if (esArchivoFaltante(error)) return [];
      throw error;
    }

    if (texto.trim() === "") return [];

    let crudo: unknown;
    try {
      crudo = JSON.parse(texto);
    } catch {
      throw new Error(`El archivo de tareas no es JSON valido: ${this.ruta}`);
    }

    if (!Array.isArray(crudo)) {
      throw new Error(`El archivo de tareas tiene que contener una lista: ${this.ruta}`);
    }

    // Si UNA tarea esta mal, se corta con el numero de posicion. La alternativa
    // —saltearla y seguir— perderia datos en silencio, que es peor que fallar
    // ruidosamente.
    return crudo.map((dato, posicion) => {
      try {
        return Tarea.desdeJSON(dato);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        throw new Error(`La tarea en la posicion ${posicion} de ${this.ruta} no es valida: ${motivo}`);
      }
    });
  }

  /**
   * Escribe la lista completa, de forma ATOMICA.
   *
   * Primero escribe un archivo temporal y despues lo renombra. El renombre es
   * una operacion del sistema operativo que no se puede quedar a medias: o el
   * archivo viejo esta entero, o el nuevo esta entero. Escribir directo sobre
   * el archivo bueno, en cambio, deja un archivo cortado si el proceso se corta
   * justo en el medio.
   */
  private async escribir(tareas: Tarea[]): Promise<void> {
    await mkdir(dirname(this.ruta), { recursive: true });
    const contenido = `${JSON.stringify(tareas.map((t) => t.aJSON()), null, 2)}\n`;
    const temporal = `${this.ruta}.tmp`;
    await writeFile(temporal, contenido, "utf8");
    // Reintenta: ver el comentario de renombrarConReintentos.
    await renombrarConReintentos(temporal, this.ruta);
  }

  async listar(): Promise<Tarea[]> {
    return await this.leer();
  }

  async buscar(id: string): Promise<Tarea | null> {
    const tareas = await this.leer();
    return tareas.find((t) => t.id === id) ?? null;
  }

  async guardar(tarea: Tarea): Promise<void> {
    const tareas = await this.leer();
    const posicion = tareas.findIndex((t) => t.id === tarea.id);
    if (posicion >= 0) {
      tareas[posicion] = tarea;
    } else {
      tareas.push(tarea);
    }
    await this.escribir(tareas);
  }

  async eliminar(id: string): Promise<void> {
    const tareas = await this.leer();
    await this.escribir(tareas.filter((t) => t.id !== id));
  }

  /**
   * El proximo id, mirando el mas alto que haya.
   *
   * Se calcula y no se guarda un contador aparte: un contador guardado se
   * desincroniza en cuanto alguien edita el archivo a mano, y entonces hay dos
   * fuentes de verdad sobre cual es el ultimo id.
   */
  async siguienteId(): Promise<string> {
    const tareas = await this.leer();
    let maximo = 0;
    for (const tarea of tareas) {
      const numero = Number.parseInt(tarea.id.replace(/^t-/, ""), 10);
      if (Number.isInteger(numero) && numero > maximo) maximo = numero;
    }
    return `t-${String(maximo + 1).padStart(4, "0")}`;
  }
}

/** La implementacion de hoy. Manana: `crearAlmacenSQLite(rutaBase)`. */
export function crearAlmacenJSON(rutaArchivo: string): Almacen {
  return new AlmacenJSON(rutaArchivo);
}

/**
 * Escribe la vista derivada que leen los presets `gabinete` y `rendimiento` (C6).
 *
 * Es lo unico que la app publica hacia el cuartel general, y es de SOLO LECTURA
 * para ellos: los datos son la fuente de verdad (H4). Se regenera entero cada
 * vez, asi que no se edita a mano.
 */
export async function publicarTablero(
  almacen: Almacen,
  rutaTablero: string,
  generadoEl: string,
): Promise<string> {
  const tareas = await almacen.listar();
  const contenido = proyectarTablero(tareas, generadoEl);
  await mkdir(dirname(rutaTablero), { recursive: true });
  await writeFile(rutaTablero, contenido, "utf8");
  return contenido;
}