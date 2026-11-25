import type { Decision } from "./acierto.js";
import { variantes, type Variante } from "./prompts.js";

export interface Caso {
  id: string;
  cv: string;
  esperada: Decision;
}

export interface Dataset {
  dev: Caso[];
  holdout: Caso[];
}

export type NombreConjunto = keyof Dataset;
export type NombrePrompt = keyof typeof variantes;

/**
 * Lo único que el runner necesita del modelo. Se sustituye por uno falso en los tests.
 * `esquema` indica si la decisión se pide con salida estructurada en vez de texto libre.
 */
export type Clasificar = (modelo: string, prompt: string, cv: string, esquema: boolean) => Promise<string>;

export const MODELOS = ["fast", "smart"] as const;
export const NOMBRES_PROMPT = Object.keys(variantes) as NombrePrompt[];
export const CONJUNTOS: readonly NombreConjunto[] = ["dev", "holdout"];
export const REPETICIONES = 5;

/** Una llamada al modelo con un caso. */
export interface Muestra {
  casoId: string;
  esperada: Decision;
  /** Texto devuelto por el modelo; "" si la llamada falló. */
  respuesta: string;
  /** Duración de la llamada en milisegundos. */
  ms: number;
  /** Mensaje del error si la llamada falló. */
  error?: string;
}

/** Una pasada completa de una combinación por un conjunto. */
export interface Ejecucion {
  modelo: string;
  prompt: NombrePrompt;
  conjunto: NombreConjunto;
  /** Empieza en 1. */
  repeticion: number;
  muestras: Muestra[];
}

export interface OpcionesRunner {
  repeticiones?: number;
  modelos?: readonly string[];
  /** Variantes de prompt a ejecutar. Por defecto, todas. */
  variantes?: readonly NombrePrompt[];
  /**
   * Milisegundos de espera entre una llamada y la siguiente, para no superar el límite
   * de peticiones del proxy. No cuenta en el tiempo medido de cada llamada. Por defecto 0.
   */
  pausaMs?: number;
  /** Se llama tras terminar cada ejecución, para mostrar el avance. */
  alTerminar?: (ejecucion: Ejecucion) => void;
}

async function medir(clasificar: Clasificar, modelo: string, variante: Variante, caso: Caso): Promise<Muestra> {
  const inicio = performance.now();
  try {
    const respuesta = await clasificar(modelo, variante.prompt, caso.cv, variante.esquema);
    return { casoId: caso.id, esperada: caso.esperada, respuesta, ms: performance.now() - inicio };
  } catch (error) {
    // Una llamada fallida cuenta como fallo (respuesta vacía), pero no tumba el resto del banco.
    const mensaje = error instanceof Error ? error.message : String(error);
    return { casoId: caso.id, esperada: caso.esperada, respuesta: "", ms: performance.now() - inicio, error: mensaje };
  }
}

/**
 * Ejecuta todas las combinaciones modelo x prompt x conjunto, repetidas N veces.
 * Las llamadas se hacen una a una para que el tiempo medido sea el de cada llamada
 * y no el de una cola de peticiones en paralelo.
 */
export async function ejecutarBanco(
  dataset: Dataset,
  clasificar: Clasificar,
  opciones: OpcionesRunner = {},
): Promise<Ejecucion[]> {
  const { repeticiones = REPETICIONES, modelos = MODELOS, variantes: seleccion = NOMBRES_PROMPT, pausaMs = 0, alTerminar } =
    opciones;
  const ejecuciones: Ejecucion[] = [];
  let primeraLlamada = true;

  // La pausa va antes de cada llamada salvo la primera, y fuera del cronómetro de `medir`.
  const llamar = async (modelo: string, variante: Variante, caso: Caso): Promise<Muestra> => {
    if (!primeraLlamada && pausaMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pausaMs));
    }
    primeraLlamada = false;
    return medir(clasificar, modelo, variante, caso);
  };

  for (const modelo of modelos) {
    for (const prompt of seleccion) {
      for (const conjunto of CONJUNTOS) {
        for (let repeticion = 1; repeticion <= repeticiones; repeticion++) {
          const muestras: Muestra[] = [];
          for (const caso of dataset[conjunto]) {
            muestras.push(await llamar(modelo, variantes[prompt], caso));
          }
          const ejecucion: Ejecucion = { modelo, prompt, conjunto, repeticion, muestras };
          ejecuciones.push(ejecucion);
          alTerminar?.(ejecucion);
        }
      }
    }
  }
  return ejecuciones;
}
