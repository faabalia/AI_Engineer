import { porcentajeAcierto } from "./acierto.js";
import type { Ejecucion, NombreConjunto, NombrePrompt } from "./runner.js";

/** Acierto medio (en %) a partir del cual una combinación se da por buena. */
export const UMBRAL_ACIERTO = 75;

/** Una fila del informe: una combinación de modelo, prompt y conjunto. */
export interface FilaInforme {
  modelo: string;
  prompt: NombrePrompt;
  conjunto: NombreConjunto;
  /** Número de repeticiones sobre las que se calcula. */
  repeticiones: number;
  /** Porcentajes de acierto (0-100) entre las repeticiones. */
  aciertoMinimo: number;
  aciertoMedio: number;
  aciertoMaximo: number;
  /** Media de la duración de todas las llamadas de la combinación, en milisegundos. */
  tiempoMedioMs: number;
  /** true si el acierto medio alcanza el umbral. */
  superaUmbral: boolean;
  /** Total de llamadas al modelo del grupo. */
  llamadas: number;
  /** Cuántas de ellas fallaron (error del modelo o del proxy, no respuesta incorrecta). */
  llamadasConError: number;
}

function media(valores: readonly number[]): number {
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

/**
 * Agrupa las ejecuciones por modelo, prompt y conjunto y calcula, por grupo, el
 * acierto mínimo, medio y máximo entre repeticiones y el tiempo medio por llamada.
 * Las filas salen en el orden en que aparece cada combinación en la entrada.
 */
export function calcularInforme(
  ejecuciones: readonly Ejecucion[],
  umbral: number = UMBRAL_ACIERTO,
): FilaInforme[] {
  const grupos = new Map<string, Ejecucion[]>();
  for (const ejecucion of ejecuciones) {
    const clave = `${ejecucion.modelo}|${ejecucion.prompt}|${ejecucion.conjunto}`;
    const grupo = grupos.get(clave);
    if (grupo === undefined) {
      grupos.set(clave, [ejecucion]);
    } else {
      grupo.push(ejecucion);
    }
  }

  return [...grupos.values()].map((grupo) => {
    const [primera] = grupo;
    if (primera === undefined) {
      throw new Error("Grupo de ejecuciones vacío");
    }
    // Una muestra ya tiene la forma de un Resultado (respuesta y esperada).
    const aciertos = grupo.map((ejecucion) => porcentajeAcierto(ejecucion.muestras));
    const muestras = grupo.flatMap((ejecucion) => ejecucion.muestras);
    const tiempos = muestras.map((muestra) => muestra.ms);
    const aciertoMedio = media(aciertos);

    return {
      modelo: primera.modelo,
      prompt: primera.prompt,
      conjunto: primera.conjunto,
      repeticiones: grupo.length,
      aciertoMinimo: Math.min(...aciertos),
      aciertoMedio,
      aciertoMaximo: Math.max(...aciertos),
      tiempoMedioMs: media(tiempos),
      superaUmbral: aciertoMedio >= umbral,
      llamadas: muestras.length,
      llamadasConError: muestras.filter((muestra) => muestra.error !== undefined).length,
    };
  });
}
