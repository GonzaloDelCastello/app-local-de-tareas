// Lo que comparten todas las rutas de la API: la forma de la respuesta, la
// forma del error y los validadores de cuerpo.
//
// POR QUE EXISTE ESTE ARCHIVO
//
// Cuando estaban todos juntos en api.ts, el archivo tenia 645 lineas y TRES
// razones para cambiar: el contrato de tareas, el de pomodoros, y la forma de un
// error. Para agregar un recurso habia que editar el archivo del que dependen
// las pruebas del otro; un cambio en un validador podia romper tareas sin que
// nadie lo hubiera tocado.
//
// Partido en tres, cada archivo tiene una sola razon para cambiar:
//
//   api-comun.ts       esto: lo que usan todos
//   api.ts             solo tareas
//   api-pomodoros.ts   solo pomodoros
//
// Regla de este modulo: si algo se repite en los dos recursos, va aca. Si es de
// un recurso, no entra.

/** Lo que la API devuelve. El servidor lo traduce a HTTP. */
export interface RespuestaApi {
  codigo: number;
  /** null en las respuestas sin cuerpo (204). */
  cuerpo: unknown;
  encabezados?: Record<string, string>;
  /**
   * true si la operacion cambio los datos. El servidor lo usa para regenerar la
   * vista derivada que leen los agentes: la API decide, el servidor hace el
   * efecto. Un GET nunca lo pone en true.
   */
  cambio?: boolean;
}

/** El error que se convierte en 400. */
export class SolicitudInvalida extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(problemas.join("; "));
    this.problemas = problemas;
  }
}

/** 404 con el motivo. */
export function noEncontrado(mensaje: string): RespuestaApi {
  return { codigo: 404, cuerpo: { error: mensaje } };
}

/** 400 con la lista de problemas, para que quien llama pueda corregir. */
export function noValido(problemas: string[]): RespuestaApi {
  return { codigo: 400, cuerpo: { error: "La solicitud no es valida", detalles: problemas } };
}

/** 405 con el encabezado Allow: no alcanza con decir que no, hay que decir cuales si. */
export function metodoNoPermitido(permitidos: string): RespuestaApi {
  return {
    codigo: 405,
    cuerpo: { error: `Ese metodo no existe para esta ruta. Los validos son: ${permitidos}` },
    encabezados: { Allow: permitidos },
  };
}

// ---------------------------------------------------------------------------
// Validacion del cuerpo
//
// Esto es lo que los tipos NO pueden hacer. Un `TareaJSON` describe la forma de
// un dato que ya es correcto; no dice nada de lo que llega de afuera. Un cuerpo
// de peticion es `unknown` hasta que alguien lo revisa, y ese alguien es este.
// ---------------------------------------------------------------------------

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function comoObjeto(cuerpoCrudo: string): Record<string, unknown> {
  if (cuerpoCrudo.trim() === "") {
    throw new SolicitudInvalida(["el cuerpo de la peticion esta vacio"]);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(cuerpoCrudo);
  } catch {
    throw new SolicitudInvalida(["el cuerpo no es JSON valido"]);
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    throw new SolicitudInvalida(["el cuerpo tiene que ser un objeto JSON"]);
  }
  return crudo as Record<string, unknown>;
}

export function texto(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "string") {
    problemas.push(`"${campo}" tiene que ser texto`);
    return undefined;
  }
  return valor;
}

export function booleano(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): boolean | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "boolean") {
    problemas.push(`"${campo}" tiene que ser true o false`);
    return undefined;
  }
  return valor;
}

export function fechaOpcional(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string" || !FORMATO_FECHA.test(valor)) {
    problemas.push(`"${campo}" tiene que ser null o una fecha AAAA-MM-DD`);
    return undefined;
  }
  return valor;
}

export function enteroOpcional(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): number | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor <= 0) {
    problemas.push(`"${campo}" tiene que ser null o un entero mayor que 0`);
    return undefined;
  }
  return valor;
}

export function enLista<T extends string>(
  crudo: Record<string, unknown>,
  campo: string,
  validos: readonly T[],
  problemas: string[],
): T | null | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "string" || !validos.includes(valor as T)) {
    problemas.push(`"${campo}" tiene que ser null o uno de: ${validos.join(", ")}`);
    return undefined;
  }
  return valor as T;
}

export function listaDeTextos(
  crudo: Record<string, unknown>,
  campo: string,
  problemas: string[],
): string[] | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor) || valor.some((e) => typeof e !== "string")) {
    problemas.push(`"${campo}" tiene que ser una lista de textos`);
    return undefined;
  }
  return valor as string[];
}

/**
 * Igual que `enLista`, pero `null` NO es un valor valido.
 *
 * Para el estado no existe el "sin valor": una tarea siempre esta en alguno de
 * los cuatro. Aceptar null ahi seria aceptar un estado que no existe. El error
 * de tipos que obligo a separar esta funcion fue real: `null` se estaba colando
 * como si fuera un estado valido.
 */
export function enListaSinNull<T extends string>(
  crudo: Record<string, unknown>,
  campo: string,
  validos: readonly T[],
  problemas: string[],
): T | undefined {
  const valor = crudo[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== "string" || !validos.includes(valor as T)) {
    problemas.push(`"${campo}" tiene que ser uno de: ${validos.join(", ")}`);
    return undefined;
  }
  return valor as T;
}