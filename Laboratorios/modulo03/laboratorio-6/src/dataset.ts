import { readFile } from "node:fs/promises";
import { DECISIONES, type Decision } from "./acierto.js";
import type { Caso, Dataset } from "./runner.js";

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esDecision(valor: unknown): valor is Decision {
  return DECISIONES.some((decision) => decision === valor);
}

function parsearCaso(valor: unknown, conjunto: string, posicion: number): Caso {
  const donde = `${conjunto}[${posicion}]`;
  if (!esObjeto(valor)) {
    throw new Error(`${donde}: debe ser un objeto`);
  }
  const { id, cv, esperada } = valor;
  if (typeof id !== "string" || id === "") {
    throw new Error(`${donde}: "id" debe ser un texto no vacío`);
  }
  if (typeof cv !== "string" || cv.trim() === "") {
    throw new Error(`${donde} (${id}): "cv" debe ser un texto no vacío`);
  }
  if (!esDecision(esperada)) {
    throw new Error(`${donde} (${id}): "esperada" debe ser ${DECISIONES.join(", ")}`);
  }
  return { id, cv, esperada };
}

function parsearConjunto(valor: unknown, conjunto: string): Caso[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new Error(`"${conjunto}" debe ser una lista con al menos un caso`);
  }
  return valor.map((caso, posicion) => parsearCaso(caso, conjunto, posicion));
}

/**
 * Comprueba la forma del JSON y lo convierte en un Dataset. Se valida porque
 * una etiqueta mal escrita ("apta") haría que ese caso fallara siempre sin avisar.
 */
export function parsearDataset(json: unknown): Dataset {
  if (!esObjeto(json)) {
    throw new Error("El dataset debe ser un objeto con las listas dev y holdout");
  }
  const dev = parsearConjunto(json.dev, "dev");
  const holdout = parsearConjunto(json.holdout, "holdout");

  const vistos = new Set<string>();
  for (const caso of [...dev, ...holdout]) {
    if (vistos.has(caso.id)) {
      throw new Error(`Id repetido en el dataset: ${caso.id}`);
    }
    vistos.add(caso.id);
  }
  return { dev, holdout };
}

export async function cargarDataset(ruta: string): Promise<Dataset> {
  return parsearDataset(JSON.parse(await readFile(ruta, "utf-8")));
}
