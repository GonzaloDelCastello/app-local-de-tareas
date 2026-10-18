// La capa de persistencia, detras de UNA sola interfaz (decision C7).
//
// POR QUE UNA INTERFAZ Y NO UN ARCHIVO SUELTO
//
// C7 dice: JSON primero, SQLite despues, detras de la misma interfaz. Lo que
// hace barato ese cambio no es el formato, es esto: el resto del programa
// depende de `Almacen`, no de `AlmacenJSON`.
//
// POR QUE ES GENERICA (C23)
//
// Cuando aparecieron los pomodoros hubo que elegir: un segundo almacen para
// ellos, o generalizar este. Se generalizo, porque lo dificil de esta capa no
// es "guardar tareas": es escribir sin romper el archivo (atomicamente) y
// sobrevivir al renombre que Windows rechaza cuando el antivirus tiene el
// archivo abierto. Eso es igual para todo lo que se guarde, y no tiene sentido
// escribirlo dos veces ni arreglarlo en dos lugares.
//
// Lo unico que cambia entre una cosa y otra es COMO se convierte el objeto a su
// forma guardada. Eso entra por parametro: es el `Conversor<T>`.
//
// Los metodos son `async` aunque leer un archivo podria ser sincronico. El
// motivo es que la implementacion de SQLite (y cualquier otra que venga
// despues: una base remota, un archivo en red) no tiene por que serlo.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { fechaEnZona } from "./config.ts";
import { Pomodoro, proyectarPomodoros } from "./pomodoro.ts";
import { Tarea, proyectarTablero } from "./tarea.ts";

/** Lo minimo que tiene que tener algo para poder guardarse: un `id` propio. */
export interface ConId {
  readonly id: string;
}

/**
 * Lo que se puede hacer con lo que este guardado.
 *
 * Esta es la frontera: quien la use no sabe si los datos estan en un JSON, en
 * SQLite o en un archivo de texto.
 */
export interface Almacen<T extends ConId> {
  /** Todo lo guardado. Lista vacia si todavia no hay nada. */
  listar(): Promise<T[]>;
  /** El elemento con ese id, o null. */
  buscar(id: string): Promise<T | null>;
  /** Agrega, o reemplaza si ya existe uno con el mismo id. */
  guardar(elemento: T): Promise<void>;
  /** Lo saca. Si no existe, no hace nada. */
  eliminar(id: string): Promise<void>;
  /** El proximo id libre, con el formato <prefijo>-0001. */
  siguienteId(): Promise<string>;
}

/**
 * Como se pasa de la forma guardada al objeto y al reves.
 *
 * Es lo unico que distingue un almacen de tareas de uno de pomodoros, y es lo
 * que permite que el resto de la clase sea generico.
 */
export interface Conversor<T> {
  /** Reconstruye el objeto desde lo que devolvio JSON.parse. Tiene que validar. */
  desdeJSON(dato: unknown): T;
  /** La forma que se guarda. */
  aJSON(elemento: T): unknown;
}

/** Lo que hace falta para armar un almacen en JSON. */
export interface ConfiguracionAlmacen<T extends ConId> {
  ruta: string;
  conversor: Conversor<T>;
  /** La primera letra del id: "t" para tareas, "p" para pomodoros. */
  prefijoId: string;
  /**
   * Como se llama lo que se guarda, en singular, para los mensajes de error.
   * Los plurales se arman agregando "s": tarea/tareas, pomodoro/pomodoros.
   */
  nombre: string;
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

class AlmacenJSON<T extends ConId> implements Almacen<T> {
  private readonly ruta: string;
  private readonly conversor: Conversor<T>;
  private readonly prefijoId: string;
  private readonly nombre: string;

  constructor(configuracion: ConfiguracionAlmacen<T>) {
    this.ruta = configuracion.ruta;
    this.conversor = configuracion.conversor;
    this.prefijoId = configuracion.prefijoId;
    this.nombre = configuracion.nombre;
  }

  /**
   * Lee y convierte TODO, en cada operacion.
   *
   * Es simple y para cientos de elementos alcanza de sobra. Tiene un limite
   * honesto: con miles, guardar uno solo reescribe el archivo entero. Cuando
   * eso moleste, es exactamente el momento de pasar a SQLite, y el cambio queda
   * encerrado en esta clase.
   */
  private async leer(): Promise<T[]> {
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
      throw new Error(`El archivo de ${this.nombre}s no es JSON valido: ${this.ruta}`);
    }

    if (!Array.isArray(crudo)) {
      throw new Error(`El archivo de ${this.nombre}s tiene que contener una lista: ${this.ruta}`);
    }

    // Si UNO esta mal, se corta con el numero de posicion. La alternativa
    // —saltearlo y seguir— perderia datos en silencio, que es peor que fallar
    // ruidosamente.
    return crudo.map((dato, posicion) => {
      try {
        return this.conversor.desdeJSON(dato);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        throw new Error(`El ${this.nombre} en la posicion ${posicion} de ${this.ruta} no es valido: ${motivo}`);
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
  private async escribir(elementos: T[]): Promise<void> {
    await mkdir(dirname(this.ruta), { recursive: true });
    const contenido = `${JSON.stringify(elementos.map((e) => this.conversor.aJSON(e)), null, 2)}\n`;
    const temporal = `${this.ruta}.tmp`;
    await writeFile(temporal, contenido, "utf8");
    // Reintenta: ver el comentario de renombrarConReintentos.
    await renombrarConReintentos(temporal, this.ruta);
  }

  async listar(): Promise<T[]> {
    return await this.leer();
  }

  async buscar(id: string): Promise<T | null> {
    const elementos = await this.leer();
    return elementos.find((e) => e.id === id) ?? null;
  }

  async guardar(elemento: T): Promise<void> {
    const elementos = await this.leer();
    const posicion = elementos.findIndex((e) => e.id === elemento.id);
    if (posicion >= 0) {
      elementos[posicion] = elemento;
    } else {
      elementos.push(elemento);
    }
    await this.escribir(elementos);
  }

  async eliminar(id: string): Promise<void> {
    const elementos = await this.leer();
    await this.escribir(elementos.filter((e) => e.id !== id));
  }

  /**
   * El proximo id, mirando el mas alto que haya.
   *
   * Se calcula y no se guarda un contador aparte: un contador guardado se
   * desincroniza en cuanto alguien edita el archivo a mano, y entonces hay dos
   * fuentes de verdad sobre cual es el ultimo id.
   */
  async siguienteId(): Promise<string> {
    let maximo = 0;
    for (const elemento of await this.leer()) {
      // Cualquier id que no sea <prefijo>-<numero> se ignora en vez de romper.
      const numero = Number.parseInt(elemento.id.replace(/^[a-z]-/, ""), 10);
      if (Number.isInteger(numero) && numero > maximo) maximo = numero;
    }
    return `${this.prefijoId}-${String(maximo + 1).padStart(4, "0")}`;
  }
}

/** La implementacion de hoy. Manana: `crearAlmacenSQLite(configuracion)`. */
export function crearAlmacenJSON<T extends ConId>(configuracion: ConfiguracionAlmacen<T>): Almacen<T> {
  return new AlmacenJSON(configuracion);
}

/**
 * El almacen de tareas, armado.
 *
 * Existe para no repetir la configuracion en cada lugar que lo necesita: el
 * prefijo y el conversor de tareas se escriben una sola vez.
 */
export function crearAlmacenDeTareas(rutaArchivo: string): Almacen<Tarea> {
  return crearAlmacenJSON({
    ruta: rutaArchivo,
    conversor: {
      desdeJSON: (dato) => Tarea.desdeJSON(dato),
      aJSON: (tarea) => tarea.aJSON(),
    },
    prefijoId: "t",
    nombre: "tarea",
  });
}

/**
 * Escribe la vista derivada que leen los presets `gabinete` y `rendimiento` (C6).
 *
 * Es lo unico que la app publica hacia el cuartel general, y es de SOLO LECTURA
 * para ellos: los datos son la fuente de verdad (H4). Se regenera entero cada
 * vez, asi que no se edita a mano.
 */
export async function publicarTablero(
  almacenTareas: Almacen<Tarea>,
  almacenPomodoros: Almacen<Pomodoro>,
  rutaTablero: string,
  ahora: Date,
): Promise<string> {
  // La fecha se calcula aca adentro y no se recibe: asi no puede pasar que la
  // fecha y el reloj digan cosas distintas.
  const fecha = fechaEnZona(ahora);

  const tareas = await almacenTareas.listar();
  const pomodoros = await almacenPomodoros.listar();

  // El id de la tarea no dice nada: el agente necesita el titulo.
  const titulos = new Map(tareas.map((t) => [t.id, t.titulo] as const));

  // Los pomodoros van DEBAJO de las tareas, y solo si hubo alguno hoy.
  const contenido = [proyectarTablero(tareas, fecha), proyectarPomodoros(pomodoros, fecha, titulos, ahora)]
    .filter((bloque) => bloque !== "")
    .join("\n");

  await mkdir(dirname(rutaTablero), { recursive: true });
  await writeFile(rutaTablero, contenido, "utf8");
  return contenido;
}
/**
 * El almacen de pomodoros, armado.
 *
 * Es identico al de tareas salvo el prefijo, el conversor y el nombre. Esa es
 * toda la diferencia entre guardar una cosa y la otra.
 */
export function crearAlmacenDePomodoros(rutaArchivo: string): Almacen<Pomodoro> {
  return crearAlmacenJSON({
    ruta: rutaArchivo,
    conversor: {
      desdeJSON: (dato) => Pomodoro.desdeJSON(dato),
      aJSON: (pomodoro) => pomodoro.aJSON(),
    },
    prefijoId: "p",
    nombre: "pomodoro",
  });
}