export const DECISIONES = ["apto", "descartar", "revisar"] as const;
export type Decision = (typeof DECISIONES)[number];

export interface Resultado {
  /** Texto tal cual lo devolvió el modelo. */
  respuesta: string;
  esperada: Decision;
}

/** Quita espacios de los extremos y pasa a minúsculas. */
export function normalizar(respuesta: string): string {
  return respuesta.trim().toLowerCase();
}

/** Un acierto exige que la respuesta normalizada sea exactamente la etiqueta esperada. */
export function esAcierto({ respuesta, esperada }: Resultado): boolean {
  return normalizar(respuesta) === esperada;
}

/**
 * Porcentaje (0-100) de resultados acertados. Cualquier respuesta que no sea
 * una de las tres etiquetas, o que no coincida con la esperada, cuenta como fallo.
 */
export function porcentajeAcierto(resultados: readonly Resultado[]): number {
  if (resultados.length === 0) {
    throw new Error("No hay resultados con los que calcular el acierto");
  }
  const aciertos = resultados.filter(esAcierto).length;
  return (aciertos / resultados.length) * 100;
}
