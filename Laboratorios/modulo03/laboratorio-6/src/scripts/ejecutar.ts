import "dotenv/config";
import { parseArgs } from "node:util";
import { crearClasificador } from "../clasificador.js";
import { cargarDataset } from "../dataset.js";
import { CONJUNTOS, ejecutarBanco, MODELOS, NOMBRES_PROMPT, REPETICIONES, type NombrePrompt } from "../runner.js";
import { guardarEvidencia, textoResultado } from "../evidencia.js";

const PAUSA_POR_DEFECTO_MS = 1000;

function esVariante(nombre: string): nombre is NombrePrompt {
  return NOMBRES_PROMPT.some((n) => n === nombre);
}

/**
 * Lanza el banco de pruebas completo contra el proxy y muestra la tabla.
 * Hace llamadas reales (unas 480): se ejecuta a mano con `npm run evaluar`.
 */
async function main(): Promise<void> {
  for (const nombre of ["OPENAI_API_KEY", "OPENAI_BASE_URL"]) {
    if (!process.env[nombre]) {
      throw new Error(`Falta la variable ${nombre}: rellénala en el archivo .env`);
    }
  }

  // Opciones para pruebas parciales: --modelos fast --variantes concreto+esquema --repeticiones 1
  const { values } = parseArgs({
    options: {
      modelos: { type: "string" },
      variantes: { type: "string" },
      repeticiones: { type: "string" },
      pausa: { type: "string" },
    },
  });
  // Pausa entre llamadas en ms (por defecto 1000) para no recibir 429 del proxy.
  const pausaMs = values.pausa === undefined ? PAUSA_POR_DEFECTO_MS : Number(values.pausa);
  if (!Number.isInteger(pausaMs) || pausaMs < 0) {
    throw new Error("--pausa debe ser un entero de milisegundos (0 o más)");
  }
  const modelos = values.modelos === undefined ? MODELOS : values.modelos.split(",").map((m) => m.trim());
  const seleccion = values.variantes === undefined ? NOMBRES_PROMPT : values.variantes.split(",").map((v) => v.trim());
  const desconocidas = seleccion.filter((v) => !esVariante(v));
  if (desconocidas.length > 0) {
    throw new Error(`Variante desconocida: ${desconocidas.join(", ")}. Disponibles: ${NOMBRES_PROMPT.join(", ")}`);
  }
  const repeticiones = values.repeticiones === undefined ? REPETICIONES : Number(values.repeticiones);
  if (!Number.isInteger(repeticiones) || repeticiones <= 0) {
    throw new Error("--repeticiones debe ser un entero positivo");
  }

  const dataset = await cargarDataset(new URL("../../dataset.json", import.meta.url).pathname);
  const total = modelos.length * seleccion.length * CONJUNTOS.length * repeticiones;
  console.log(`Dev: ${dataset.dev.length} casos. Hold-out: ${dataset.holdout.length} casos.`);
  console.log(`Modelos: ${modelos.join(", ")}. Variantes: ${seleccion.join(", ")}. Pausa entre llamadas: ${pausaMs} ms.`);
  console.log(`Ejecuciones: ${total} (${repeticiones} repeticiones por combinación).\n`);

  let hechas = 0;
  const ejecuciones = await ejecutarBanco(dataset, crearClasificador(), {
    modelos,
    variantes: seleccion.filter(esVariante),
    repeticiones,
    pausaMs,
    alTerminar: (e) => {
      hechas++;
      const fallos = e.muestras.filter((m) => m.error !== undefined);
      const primero = fallos[0]?.error?.replace(/\s+/g, " ").slice(0, 150);
      const aviso = primero === undefined ? "" : ` (${fallos.length} llamadas con error; primero: ${primero})`;
      console.log(`[${hechas}/${total}] ${e.modelo} ${e.prompt} ${e.conjunto} #${e.repeticion}${aviso}`);
    },
  });

  // Primero se muestra por consola y después se guarda: si el guardado falla, el resultado no se pierde.
  const texto = textoResultado(ejecuciones);
  console.log(`\n${texto}`);
  try {
    const ruta = await guardarEvidencia(texto, new URL("../../evidencias", import.meta.url).pathname);
    console.log(`\nEvidencia guardada en: ${ruta}`);
  } catch (error) {
    console.error(`\nNo se pudo guardar la evidencia: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
