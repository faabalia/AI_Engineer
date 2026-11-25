import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detalleFallos } from "./fallos.js";
import { calcularInforme, UMBRAL_ACIERTO } from "./informe.js";
import type { Ejecucion } from "./runner.js";
import { avisoErrores, formatearTabla } from "./tabla.js";

/**
 * Texto del resultado de una ejecución: umbral, tabla, aviso de errores (solo si hubo)
 * y casos fallados. Es lo que se muestra por consola y lo que se guarda en la evidencia.
 */
export function textoResultado(ejecuciones: readonly Ejecucion[]): string {
  const filas = calcularInforme(ejecuciones);
  const aviso = avisoErrores(filas);
  return [
    `Umbral de acierto medio: ${UMBRAL_ACIERTO}%`,
    formatearTabla(filas),
    ...(aviso === "" ? [] : [aviso]),
    `Casos fallados (dev y hold-out):\n${detalleFallos(ejecuciones)}`,
  ].join("\n\n");
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Nombre del archivo de evidencia con la hora local: evidencia-yyyymmdd-hhmmss.txt */
export function nombreEvidencia(fecha: Date): string {
  const dia = `${fecha.getFullYear()}${dosDigitos(fecha.getMonth() + 1)}${dosDigitos(fecha.getDate())}`;
  const hora = `${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}${dosDigitos(fecha.getSeconds())}`;
  return `evidencia-${dia}-${hora}.txt`;
}

/** Guarda el texto en la carpeta (la crea si no existe) y devuelve la ruta del archivo. */
export async function guardarEvidencia(texto: string, carpeta: string, fecha: Date = new Date()): Promise<string> {
  await mkdir(carpeta, { recursive: true });
  const ruta = join(carpeta, nombreEvidencia(fecha));
  await writeFile(ruta, `${texto}\n`, "utf-8");
  return ruta;
}
