import type { FilaInforme } from "./informe.js";
import { variantes } from "./prompts.js";

const CABECERA = ["modelo", "prompt", "conjunto", "acierto (mín/medio/máx)", "tiempo medio", "umbral"];

function porcentaje(valor: number): string {
  return `${Math.round(valor)}%`;
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function celdas(fila: FilaInforme): string[] {
  return [
    fila.modelo,
    variantes[fila.prompt].etiqueta,
    fila.conjunto,
    `${porcentaje(fila.aciertoMinimo)} / ${porcentaje(fila.aciertoMedio)} / ${porcentaje(fila.aciertoMaximo)}`,
    segundos(fila.tiempoMedioMs),
    fila.superaUmbral ? "✓" : "✗",
  ];
}

/**
 * Devuelve el informe como texto: una fila por combinación y columnas alineadas
 * a la izquierda. No imprime: quien la llame decide qué hacer con el texto.
 */
export function formatearTabla(filas: readonly FilaInforme[]): string {
  const lineas = [CABECERA, ...filas.map(celdas)];
  const anchos = CABECERA.map((_, columna) => Math.max(...lineas.map((linea) => (linea[columna] ?? "").length)));

  return lineas
    .map((linea) =>
      linea
        .map((celda, columna) => celda.padEnd(anchos[columna] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/**
 * Aviso con las combinaciones que tuvieron llamadas con error (por ejemplo 429 del proxy).
 * Esas llamadas cuentan como fallo, así que el acierto de esa fila queda por debajo de lo real.
 * Devuelve una cadena vacía si no hubo ningún error.
 */
export function avisoErrores(filas: readonly FilaInforme[]): string {
  const conError = filas.filter((fila) => fila.llamadasConError > 0);
  if (conError.length === 0) {
    return "";
  }
  const lineas = conError.map(
    (f) => `- ${f.modelo} ${variantes[f.prompt].etiqueta} ${f.conjunto}: ${f.llamadasConError} de ${f.llamadas} llamadas con error`,
  );
  return ["Aviso: estas llamadas fallaron y cuentan como fallo en el acierto:", ...lineas].join("\n");
}
