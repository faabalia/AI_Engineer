import type { FilaInforme } from "./informe.js";

function fila(
  modelo: string,
  prompt: FilaInforme["prompt"],
  conjunto: FilaInforme["conjunto"],
  [aciertoMinimo, aciertoMedio, aciertoMaximo]: [number, number, number],
  tiempoMedioMs: number,
  llamadasConError = 0,
): FilaInforme {
  return {
    modelo,
    prompt,
    conjunto,
    repeticiones: 5,
    aciertoMinimo,
    aciertoMedio,
    aciertoMaximo,
    tiempoMedioMs,
    superaUmbral: aciertoMedio >= 75,
    llamadas: conjunto === "dev" ? 90 : 30,
    llamadasConError,
  };
}

/**
 * Filas de ejemplo (datos fijos de una ejecución anterior del estudio) para ver o probar
 * el aspecto del informe sin llamar al proxy.
 */
export const filasEjemplo: readonly FilaInforme[] = [
  fila("fast", "vago+esquema", "dev", [72.2, 72.2, 72.2], 1800),
  fila("fast", "vago+esquema", "holdout", [66.7, 66.7, 66.7], 2000, 1),
  fila("fast", "concreto+esquema", "dev", [83.3, 86.7, 88.9], 2000, 2),
  fila("fast", "concreto+esquema", "holdout", [100, 100, 100], 2000),
  fila("smart", "vago+esquema", "dev", [44.4, 44.4, 44.4], 1400),
  fila("smart", "vago+esquema", "holdout", [50, 50, 50], 2000),
  fila("smart", "concreto+esquema", "dev", [100, 100, 100], 2000),
  fila("smart", "concreto+esquema", "holdout", [100, 100, 100], 2000),
];
